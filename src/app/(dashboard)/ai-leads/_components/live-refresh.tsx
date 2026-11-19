// File: src/app/(dashboard)/ai-leads/_components/live-refresh.tsx  (NEW file)
//
// Keeps a page up to date without a manual refresh: re-loads the page data every few seconds
// while the tab is open and visible, and right away when you come back to the tab.
// Text you are typing is kept.

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router, seconds]);

  return null;
}