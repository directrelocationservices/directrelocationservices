// File: src/app/(dashboard)/ai-leads/_components/reply-box.tsx  (NEW file)
//
// Reply box under the conversation. Sends from the same Twilio number as the thread.
// Enter = new line, Ctrl/Cmd + Enter = send. If sending fails, the text stays in the box.

"use client";

import { useActionState, useRef } from "react";
import { sendStaffText, type ReplyState } from "../conversation-actions";
import { PendingButton } from "./pending-button";

const MAX_LEN = 1000;

export function ReplyBox({
  leadId,
  disabledReason,
  aiPaused,
}: {
  leadId: string;
  disabledReason?: string | null;
  aiPaused: boolean;
}) {
  const [state, action] = useActionState<ReplyState, FormData>(sendStaffText, {
    ok: false,
    error: null,
    body: "",
    at: 0,
  });
  const formRef = useRef<HTMLFormElement>(null);

  if (disabledReason) {
    return (
      <p className="border-t border-[#F0F0F0] bg-[#FAFAFA] px-5 py-4 text-sm text-[#737373]">
        {disabledReason}
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="border-t border-[#F0F0F0] bg-[#FAFAFA] px-4 py-4 md:px-5">
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="reply-body" className="sr-only">
        Text the customer
      </label>
      <textarea
        key={state.at}
        id="reply-body"
        name="body"
        rows={3}
        maxLength={MAX_LEN}
        required
        defaultValue={state.error ? state.body : ""}
        placeholder="Type a text to the customer…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="block w-full resize-y rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-3 text-[15px] leading-relaxed placeholder:text-[#A3A3A3] focus:border-[#E10600] focus:outline-none focus:ring-2 focus:ring-[#E10600]/20"
      />
      {state.error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[#B30500]">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-2 text-sm font-semibold text-[#15803D]">
          Sent. The AI is paused on this lead.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#737373]">
          {aiPaused
            ? "The AI is paused, so only your team texts this customer."
            : "Sending a text pauses the AI on this lead."}
          <span className="hidden md:inline"> Ctrl + Enter to send.</span>
        </p>
        <PendingButton
          pendingText="Sending…"
          tone="light"
          className="w-full rounded-xl bg-[#E10600] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#C00500] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E10600] sm:w-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          Send text
        </PendingButton>
      </div>
    </form>
  );
}