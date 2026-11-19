// File: src/app/(dashboard)/ai-leads/_components/thread-scroll.tsx  (NEW file)
//
// Scroll box for the conversation. Opens at the newest message and follows new ones,
// unless you scrolled up to read older messages.

"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ThreadScroll({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const nearBottom = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (first.current || nearBottom.current) el.scrollTop = el.scrollHeight;
    first.current = false;
  }, [count]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="max-h-[60vh] overflow-y-auto overscroll-contain md:max-h-[560px]"
    >
      {children}
    </div>
  );
}