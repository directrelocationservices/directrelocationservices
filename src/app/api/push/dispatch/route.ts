// File: src/app/api/push/dispatch/route.ts  (NEW file)
//
// Supabase calls this right after a notification is created (new reply, live transfer,
// lead wants the quote by text/email). It sends the waiting notifications to the team's phones.
// Protected by the x-push-secret header (PUSH_DISPATCH_SECRET).

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/ai-leads/supabase";
import { pushSecret, sendPush, type PushSub } from "@/lib/ai-leads/push";

// (No runtime/dynamic settings: the project uses cacheComponents. POST routes always run on Node and are never cached.)

interface Pending {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  subs: PushSub[];
}

function secretOk(given: string | null) {
  const secret = pushSecret();
  if (!secret || secret.length < 20 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-push-secret"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const secret = pushSecret();
  const supa = db();
  let sent = 0;
  let notifications = 0;

  // a few rounds, in case more arrive while sending
  for (let round = 0; round < 4; round++) {
    const { data, error } = await supa.rpc("ai_push_claim", { p_secret: secret, p_limit: 25 });
    if (error) return NextResponse.json({ ok: false, error: "claim failed" }, { status: 500 });
    const batch = (data ?? []) as Pending[];
    if (batch.length === 0) break;

    for (const n of batch) {
      notifications++;
      const res = await sendPush(n.subs ?? [], {
        title: n.title,
        body: n.body,
        url: n.url,
        tag: `${n.kind}:${n.url ?? n.id}`,
      });
      sent += res.sent;
      await Promise.all(
        res.gone.map((endpoint: string) => supa.rpc("ai_push_remove_subscription", { p_secret: secret, p_endpoint: endpoint })),
      );
      await supa.rpc("ai_push_mark_result", {
        p_secret: secret,
        p_id: n.id,
        p_result: { devices: n.subs?.length ?? 0, sent: res.sent, failed: res.failed, removed: res.gone.length },
      });
    }
  }

  return NextResponse.json({ ok: true, notifications, sent });
}