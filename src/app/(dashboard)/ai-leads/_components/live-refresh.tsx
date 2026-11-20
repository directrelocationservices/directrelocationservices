// File: src/app/(dashboard)/ai-leads/_components/live-refresh.tsx  (REPLACE existing file)
//
// Live updates WITHOUT polling:
//  - opens one Realtime connection to Supabase (private channel "ai-leads", signed-in users only)
//  - the database sends a small signal when a lead / text / call / task / transfer changes
//  - the page reloads its data only then (on a lead page: only when THAT lead changed)
//  - phone asleep / tab hidden: catches up once when you come back
//  - if Realtime can't connect (e.g. blocked network), it falls back to the old slow refresh
// Text you are typing is kept.

"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

let client: SupabaseClient | null = null;
function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createBrowserClient(url, key);
  return client;
}

export function LiveRefresh({ seconds = 20, leadId }: { seconds?: number; leadId?: string }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const supabase = browserClient();
    let live = false; // Realtime connected
    let missed = false; // something changed (or we were offline) while the tab was hidden
    let debounce: number | undefined;
    let fallback: number | undefined;
    let stopped = false;

    const visible = () => document.visibilityState === "visible";
    const refresh = () => {
      window.clearTimeout(debounce);
      if (!visible()) {
        missed = true;
        return;
      }
      // several changes close together → one reload
      debounce = window.setTimeout(() => routerRef.current.refresh(), 800);
    };

    const startFallback = () => {
      if (fallback || stopped) return;
      fallback = window.setInterval(() => {
        if (visible()) routerRef.current.refresh();
      }, seconds * 1000);
    };
    const stopFallback = () => {
      window.clearInterval(fallback);
      fallback = undefined;
    };

    const onVisible = () => {
      if (!visible()) return;
      if (missed || !live) {
        missed = false;
        routerRef.current.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    if (!supabase) {
      startFallback();
      return () => {
        stopped = true;
        stopFallback();
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", onVisible);
      };
    }

    const channel = supabase.channel("ai-leads", { config: { private: true } });
    channel.on("broadcast", { event: "change" }, ({ payload }) => {
      const p = (payload ?? {}) as { all?: boolean; leads?: string[] };
      if (leadId && !p.all && !(p.leads ?? []).includes(leadId)) return;
      refresh();
    });

    (async () => {
      // the signed-in user's token lets us join the private channel
      const { data } = await supabase.auth.getSession();
      if (stopped) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (!live) {
            const wasDown = fallback !== undefined;
            live = true;
            stopFallback();
            if (wasDown) refresh(); // catch up on anything missed while disconnected
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          live = false;
          startFallback();
        }
      });
    })();

    // if it hasn't connected in 15 s, keep the page fresh the old way until it does
    const guard = window.setTimeout(() => {
      if (!live) startFallback();
    }, 15000);

    return () => {
      stopped = true;
      window.clearTimeout(guard);
      window.clearTimeout(debounce);
      stopFallback();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      supabase.removeChannel(channel);
    };
  }, [leadId, seconds]);

  return null;
}