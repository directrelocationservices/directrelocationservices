// File: src/app/(dashboard)/ai-leads/push-actions.ts  (NEW file)
//
// Settings page: turn phone notifications on/off for this device, pick which ones you want,
// and send yourself a test notification.

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/ai-leads/auth";
import { db } from "@/lib/ai-leads/supabase";
import { pushConfigured, pushSecret, sendPush, type PushSub } from "@/lib/ai-leads/push";

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!input?.endpoint || !input.p256dh || !input.auth) return { ok: false, error: "This device didn't give a push address." };
  const { data, error } = await db().rpc("ai_push_save_subscription", {
    p_secret: pushSecret(),
    p_user: user.id,
    p_email: user.email ?? null,
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_ua: (input.userAgent ?? "").slice(0, 300),
  });
  const res = data as { ok: boolean } | null;
  if (error || !res?.ok) return { ok: false, error: "Couldn't save this device. Check PUSH_DISPATCH_SECRET in Vercel and Supabase." };
  revalidatePath("/ai-leads/sources");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await requireUser();
  if (!endpoint) return;
  await db().rpc("ai_push_remove_subscription", { p_secret: pushSecret(), p_endpoint: endpoint });
  revalidatePath("/ai-leads/sources");
}

export async function setPushPrefs(prefs: {
  new_reply: boolean;
  live_transfer: boolean;
  prefers_contact: boolean;
}): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { error } = await db().rpc("ai_push_set_prefs", {
    p_user: user.id,
    p_new_reply: !!prefs.new_reply,
    p_live_transfer: !!prefs.live_transfer,
    p_prefers_contact: !!prefs.prefers_contact,
  });
  return { ok: !error };
}

export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!pushConfigured()) return { ok: false, message: "Notifications aren't set up yet (VAPID keys missing in Vercel)." };
  const { data, error } = await db().rpc("ai_push_user_devices", { p_secret: pushSecret(), p_user: user.id });
  if (error) return { ok: false, message: "Couldn't load your devices." };
  const subs = (data ?? []) as PushSub[];
  if (subs.length === 0) return { ok: false, message: "Turn notifications on for this device first." };
  const res = await sendPush(subs, {
    title: "DRS Leads test",
    body: "Notifications are working on this device.",
    url: "/ai-leads/sources",
    tag: "test",
  });
  await Promise.all(
    res.gone.map((endpoint: string) => db().rpc("ai_push_remove_subscription", { p_secret: pushSecret(), p_endpoint: endpoint })),
  );
  return res.sent > 0
    ? { ok: true, message: `Sent to ${res.sent} device${res.sent === 1 ? "" : "s"}.` }
    : { ok: false, message: "Couldn't deliver. Turn notifications off and on again on this device." };
}