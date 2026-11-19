// File: src/app/(dashboard)/ai-leads/_components/pwa-install.tsx  (NEW file)
//
// 1) Registers the service worker (public/sw.js) so the dashboard can be installed as an app.
// 2) Shows a small "Install the app" bar on phones that are not using the app yet:
//    - Android / Chrome: an "Install" button (the browser's own install prompt)
//    - iPhone / iPad Safari: how to add it (Share, then Add to Home Screen)
//    Hidden inside the installed app, and once dismissed.

"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "drs-install-dismissed";

function wasDismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || wasDismissed()) return;

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    if (isIos) {
      setIos(true);
      setShow(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: just hide for now */
    }
  };

  return (
    <div className="border-b border-[#F0F0F0] bg-[#FFF8F7] md:hidden">
      <div className="mx-auto flex w-full max-w-[1480px] items-center gap-3 px-4 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="grid h-10 w-14 shrink-0 place-items-center rounded-xl border border-[#F0F0F0] bg-white p-1">
          <img src="/logo.webp" alt="" className="max-h-full max-w-full object-contain" />
        </span>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-[#3D3D3D]">
          <b className="text-[#171717]">Get the DRS Leads app.</b>{" "}
          {ios ? (
            <>
              Tap{" "}
              <svg className="inline h-4 w-4 align-[-3px] text-[#1D4ED8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
                <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>{" "}
              Share, then <b>Add to Home Screen</b>.
            </>
          ) : (
            "Opens full screen and stays signed in."
          )}
        </p>
        {prompt && !ios && (
          <button
            type="button"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice.catch(() => null);
              setPrompt(null);
              setShow(false);
            }}
            className="shrink-0 rounded-lg bg-[#E10600] px-3 py-2 text-xs font-bold text-white hover:bg-[#C00500]"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#737373] hover:bg-black/5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}