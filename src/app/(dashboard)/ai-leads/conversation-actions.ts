// File: src/app/(dashboard)/ai-leads/conversation-actions.ts  (NEW file)
//
// Lead page conversation:
//  - sendStaffText: a team member texts the customer from the same Twilio number as the thread.
//    The text is saved with who sent it, and the AI is paused on this lead (staff took over).
//  - setAiPaused: "Pause AI" / "Resume AI" button. Resume rebuilds the remaining follow-ups.
//
// Needs these Vercel environment variables (Project → Settings → Environment Variables):
//   TWILIO_ACCOUNT_SID          your Twilio Account SID (starts with AC)
//   TWILIO_AUTH_TOKEN           your Twilio Auth Token (keep it secret)
//   TWILIO_STATUS_CALLBACK_URL  optional: the n8n "SMS delivery status" webhook URL, so delivered/failed shows up

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/ai-leads/auth";
import { db } from "@/lib/ai-leads/supabase";

export type ReplyState = {
  ok: boolean;
  error: string | null;
  body: string; // kept when sending fails, so the text is not lost
  at: number;
};

const MAX_LEN = 1000;

function staffName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const meta = user.user_metadata ?? {};
  const name = [meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  return name?.trim() || user.email || "Team member";
}

function refresh(leadId: string) {
  revalidatePath("/ai-leads");
  revalidatePath(`/ai-leads/${leadId}`);
}

export async function sendStaffText(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const user = await requireUser();
  const leadId = String(formData.get("leadId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const fail = (error: string): ReplyState => ({ ok: false, error, body, at: Date.now() });

  if (!leadId) return fail("Missing lead.");
  if (!body) return fail("Type a message first.");
  if (body.length > MAX_LEN) return fail(`Keep the message under ${MAX_LEN} characters.`);

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return fail("Texting isn't set up on the dashboard yet. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel.");
  }

  // Who to text, and from which of our numbers (same thread as before)
  const prep = await db().rpc("ai_staff_sms_prepare", { p_lead: leadId });
  if (prep.error) return fail("Couldn't load this lead. Please try again.");
  const p = prep.data as { ok: boolean; reason?: string; to?: string; from?: string } | null;
  if (!p?.ok || !p.to || !p.from) return fail(p?.reason ?? "This lead can't be texted.");

  const params = new URLSearchParams({ To: p.to, From: p.from, Body: body });
  const callback = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (callback) params.set("StatusCallback", callback);

  let twilio: { sid?: string; status?: string; code?: number; message?: string } = {};
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
      cache: "no-store",
    });
    twilio = await res.json().catch(() => ({}));
    if (!res.ok || !twilio.sid) {
      const why =
        twilio.code === 21610
          ? "This customer replied STOP, so Twilio blocks texts to them."
          : twilio.message ?? `Twilio error ${res.status}.`;
      return fail(`Not sent. ${why}`);
    }
  } catch {
    return fail("Couldn't reach Twilio. Check your connection and try again.");
  }

  const log = await db().rpc("ai_staff_sms_log", {
    p_lead: leadId,
    p_body: body,
    p_from: p.from,
    p_to: p.to,
    p_sid: twilio.sid,
    p_status: twilio.status ?? "queued",
    p_user: user.id,
    p_user_name: staffName(user),
  });
  if (log.error) {
    // The text did go out; only saving it failed
    refresh(leadId);
    return { ok: false, error: "Sent, but it couldn't be saved to the thread. Refresh the page.", body: "", at: Date.now() };
  }

  refresh(leadId);
  return { ok: true, error: null, body: "", at: Date.now() };
}

export async function setAiPaused(formData: FormData): Promise<void> {
  const user = await requireUser();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) throw new Error("Missing lead.");
  const pause = formData.get("pause") === "true";
  const { data, error } = await db().rpc("ai_set_ai_paused", {
    p_lead: leadId,
    p_pause: pause,
    p_by: staffName(user),
  });
  if (error) throw new Error("Couldn't update the AI for this lead. Please try again.");
  const res = data as { ok: boolean; reason?: string } | null;
  if (!res?.ok) throw new Error(res?.reason ?? "Couldn't update the AI for this lead.");
  refresh(leadId);
}