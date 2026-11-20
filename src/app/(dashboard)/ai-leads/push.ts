// File: src/lib/ai-leads/push.ts  (NEW file)
//
// Sends phone push notifications (web-push). Server only.
// Needs these Vercel environment variables:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY   public key  (from: npx web-push generate-vapid-keys)
//   VAPID_PRIVATE_KEY              private key (keep it secret)
//   VAPID_SUBJECT                  mailto: address, e.g. mailto:justin@directrelocate.com
//   PUSH_DISPATCH_SECRET           long random text, the same one saved in Supabase (ai_push_config)

import "server-only";
import webpush from "web-push";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string;
}

let ready = false;

export function pushConfigured() {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  webpush.setVapidDetails(subject, pub, priv);
  ready = true;
  return true;
}

export function pushSecret() {
  return process.env.PUSH_DISPATCH_SECRET ?? "";
}

/** Sends one notification to many devices. Returns devices that no longer exist, so they can be removed. */
export async function sendPush(subs: PushSub[], payload: PushPayload) {
  if (!pushConfigured()) return { sent: 0, failed: subs.length, gone: [] as string[] };
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/ai-leads",
    tag: payload.tag,
  });
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint); // phone unsubscribed or app removed
        else failed++;
      }
    }),
  );
  return { sent, failed, gone };
}