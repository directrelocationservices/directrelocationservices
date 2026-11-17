// File: src/app/(dashboard)/ai-leads/_components/details-menu.tsx  (NEW file)
//
// A <details> dropdown that closes when you click anywhere outside it, or press Escape.

"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DetailsMenu({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const onClick = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}