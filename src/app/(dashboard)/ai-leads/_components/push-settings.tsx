// File: src/app/(dashboard)/ai-leads/_components/push-settings.tsx  (NEW file)
//
// "Phone notifications" card on the Settings page:
//  - turn notifications on/off for this device
//  - pick which ones you get (new reply, live transfer, wants quote by text/email)
//  - send yourself a test
// iPhone: works only inside the installed app (Add to Home Screen), iOS 16.4 or newer.

"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush, setPushPrefs } from "../push-actions";

type Prefs = { new_reply: boolean; live_transfer: boolean; prefers_contact: boolean };
type DeviceState = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "not-setup";

const OPTIONS: { key: keyof Prefs; title: string; text: string }[] = [
  { key: "new_reply", title: "New customer reply", text: "A customer texts back." },
  { key: "live_transfer", title: "Live transfer", text: "The AI connects a customer to sales." },
  { key: "prefers_contact", title: "Wants the quote by text or email", text: "A lead asks not to be called." },
];

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushSettings({
  vapidKey,
  initialPrefs,
  devices,
}: {
  vapidKey: string | null;
  initialPrefs: Prefs;
  devices: number;
}) {
  const [state, setState] = useState<DeviceState>("checking");
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    (async () => {
      if (!vapidKey) return setState("not-setup");
      const ua = navigator.userAgent;
      const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setState(isIos && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, [vapidKey]);

  const turnOn = () =>
    startBusy(async () => {
      setNote(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey!) }));
        const json = sub.toJSON();
        const res = await savePushSubscription({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        });
        if (!res.ok) {
          setNote({ ok: false, text: res.error ?? "Couldn't turn notifications on." });
          return;
        }
        setState("on");
        setNote({ ok: true, text: "Notifications are on for this device." });
      } catch {
        setNote({ ok: false, text: "Couldn't turn notifications on. Please try again." });
      }
    });

  const turnOff = () =>
    startBusy(async () => {
      setNote(null);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        setNote({ ok: true, text: "Notifications are off for this device." });
      } catch {
        setNote({ ok: false, text: "Couldn't turn notifications off. Please try again." });
      }
    });

  const toggle = (key: keyof Prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    startBusy(async () => {
      const res = await setPushPrefs(next);
      if (!res.ok) {
        setPrefs(prefs);
        setNote({ ok: false, text: "Couldn't save. Please try again." });
      }
    });
  };

  const test = () =>
    startBusy(async () => {
      setNote(null);
      const res = await sendTestPush();
      setNote({ ok: res.ok, text: res.message });
    });

  return (
    <div>
      {/* This device */}
      <div className="flex flex-wrap items-center gap-4 border-b border-[#F0F0F0] px-5 py-4">
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
            state === "on" ? "bg-[#E7F6EC] text-[#15803D]" : "bg-[#F5F5F5] text-[#737373]"
          }`}
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </span>
        <div className="min-w-[10rem] flex-1">
          <p className="text-sm font-extrabold">This device</p>
          <p className="mt-0.5 text-sm text-[#737373]">
            {state === "checking" && "Checking…"}
            {state === "on" && "Notifications are on."}
            {state === "off" && "Notifications are off."}
            {state === "denied" && "Blocked in your phone or browser settings. Allow notifications for this site, then come back."}
            {state === "unsupported" && "This browser can't show notifications. Use Chrome, Edge, Safari, or the installed app."}
            {state === "ios-install" &&
              "On iPhone, add the app to your Home Screen first (Share, then Add to Home Screen), then open it from there."}
            {state === "not-setup" && "Notifications aren't set up yet (VAPID keys missing in Vercel)."}
          </p>
          {devices > 0 && (
            <p className="mt-1 text-xs text-[#A3A3A3]">
              You have notifications on {devices} device{devices === 1 ? "" : "s"}.
            </p>
          )}
        </div>
        {(state === "off" || state === "on") && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {state === "on" && (
              <button
                type="button"
                onClick={test}
                disabled={busy}
                className="flex-1 rounded-xl border border-[#D4D4D4] bg-white px-4 py-2.5 text-sm font-bold text-[#3D3D3D] hover:border-[#1E1E1E] disabled:opacity-60 sm:flex-none"
              >
                Send a test
              </button>
            )}
            <button
              type="button"
              onClick={state === "on" ? turnOff : turnOn}
              disabled={busy}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60 sm:flex-none ${
                state === "on"
                  ? "border border-[#D4D4D4] bg-white text-[#3D3D3D] hover:border-[#1E1E1E] hover:bg-[#1E1E1E] hover:text-white"
                  : "bg-[#E10600] text-white hover:bg-[#C00500]"
              }`}
            >
              {busy ? "Please wait…" : state === "on" ? "Turn off" : "Turn on notifications"}
            </button>
          </div>
        )}
      </div>

      {note && (
        <p
          role="status"
          className={`border-b border-[#F0F0F0] px-5 py-2.5 text-sm font-semibold ${note.ok ? "text-[#15803D]" : "text-[#B30500]"}`}
        >
          {note.text}
        </p>
      )}

      {/* Which notifications (saved for your account, all your devices) */}
      <ul className="divide-y divide-[#F0F0F0]">
        {OPTIONS.map((o) => {
          const on = prefs[o.key];
          return (
            <li key={o.key} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{o.title}</p>
                <p className="text-xs text-[#737373]">{o.text}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={o.title}
                onClick={() => toggle(o.key)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E10600] ${
                  on ? "bg-[#E10600]" : "bg-[#D4D4D4]"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}