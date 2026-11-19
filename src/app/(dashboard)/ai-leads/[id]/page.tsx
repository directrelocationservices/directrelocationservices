// File: src/app/(dashboard)/ai-leads/[id]/page.tsx  (REPLACE existing file)
// Lead page: Re-enable card for opted-out numbers, plus "Test & archive" card (mark as test, archive, delete)
// + "Time to first text" row
// + Lead details wrap long values on phones (no more cut-off emails / cities)
// + Conversation: every text labeled Customer / AI / Staff (with who sent it), AI calls in between,
//   reply box (same Twilio number), Pause AI / Resume AI, updates by itself every 8 seconds

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/ai-leads/supabase";
import { manualOptOut } from "../actions";
import { manualOptIn } from "../optin-actions";
import { archiveLead, deleteLead, setTestLead } from "../lead-admin-actions";
import {
  Avatar,
  Card,
  ErrorNote,
  HeroTitle,
  Shell,
  StatusBadge,
  fmtDuration,
  fmtPhone,
  fmtTime,
  fullName,
  moveLine,
  place,
} from "../_components/ui";
import { PendingButton } from "../_components/pending-button";
import { setAiPaused } from "../conversation-actions";
import { ReplyBox } from "../_components/reply-box";
import { LiveRefresh } from "../_components/live-refresh";
import { ThreadScroll } from "../_components/thread-scroll";

interface Activity {
  at: string;
  kind: "sms_outbound" | "sms_inbound" | "call" | "transfer";
  detail: string | null;
  status: string | null;
  recording_url: string | null;
}

const KIND: Record<
  Activity["kind"],
  { label: string; icon: string; bubble: string }
> = {
  sms_outbound: {
    label: "Text sent",
    icon: "bg-[#EDEDED] text-[#1E1E1E]",
    bubble: "border-[#E5E5E5] bg-[#FAFAFA]",
  },
  sms_inbound: {
    label: "Customer replied",
    icon: "bg-[#FFF4DB] text-[#D97706]",
    bubble: "border-[#FBE3B0] bg-[#FFFBF0]",
  },
  call: {
    label: "AI call",
    icon: "bg-[#FDECEB] text-[#E10600]",
    bubble: "border-[#F8D4D1] bg-[#FFF8F7]",
  },
  transfer: {
    label: "Warm transfer",
    icon: "bg-[#E7F6EC] text-[#16A34A]",
    bubble: "border-[#C6EBD2] bg-[#F4FBF6]",
  },
};

interface ThreadMessage {
  id: string;
  at: string;
  sender: "customer" | "ai" | "staff";
  staff_name: string | null;
  body: string | null;
  status: string | null;
  error: string | null;
}

/** One row of the conversation: a text, or an AI call / transfer in between */
type ThreadItem =
  | { type: "text"; at: string; m: ThreadMessage }
  | { type: "event"; at: string; a: Activity };

const SENDER = {
  customer: { label: "Customer", bubble: "rounded-bl-md border border-[#E5E5E5] bg-white text-[#171717]" },
  ai: { label: "AI", bubble: "rounded-br-md bg-[#1E1E1E] text-white" },
  staff: { label: "Staff", bubble: "rounded-br-md bg-[#FDECEB] text-[#171717] ring-1 ring-[#F8D4D1]" },
} as const;

const TASK_LABEL: Record<string, string> = {
  sms: "Text",
  call: "AI call",
  mark_unresponsive: "Mark as no response",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supa = db();

  // Opening the lead page marks the customer's replies as read
  await supa.rpc("ai_mark_thread_read", { p_lead: id });

  const [leadRes, activityRes, tasksRes, threadRes] = await Promise.all([
    supa.from("v_ai_leads").select("*").eq("id", id).maybeSingle(),
    supa
      .from("v_ai_activity")
      .select("*")
      .eq("lead_id", id)
      .order("at", { ascending: true })
      .returns<Activity[]>(),
    supa
      .from("ai_tasks")
      .select("id, action, step_no, reason, run_at")
      .eq("lead_id", id)
      .eq("status", "pending")
      .order("run_at"),
    supa.rpc("ai_lead_thread", { p_lead: id }),
  ]);

  const errors = [leadRes.error, activityRes.error, tasksRes.error, threadRes.error]
    .filter((e) => e !== null)
    .map((e) => e.message);
  if (errors.length) {
    return (
      <Shell active="leads" hero={<HeroTitle title="Lead" />}>
        <ErrorNote messages={errors} />
      </Shell>
    );
  }

  const lead = leadRes.data;
  if (!lead) notFound();
  const activity = activityRes.data ?? [];
  const messages = (threadRes.data ?? []) as ThreadMessage[];
  // Texts from the thread + calls/transfers from the activity log, in time order
  const thread: ThreadItem[] = [
    ...messages.map((m) => ({ type: "text" as const, at: m.at, m })),
    ...activity
      .filter((a) => a.kind === "call" || a.kind === "transfer")
      .map((a) => ({ type: "event" as const, at: a.at, a })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  const aiPaused = Boolean(lead.ai_paused_at);
  const replyBlocked =
    !lead.phone_e164 || lead.phone_e164 === "invalid"
      ? "This lead has no valid phone number, so it can't be texted."
      : lead.status === "opted_out"
        ? "This number opted out of texts. Re-enable it on the right first, only if the customer asked for messages again."
        : null;
  const tasks = tasksRes.data ?? [];
  const name = fullName(lead.first_name, lead.last_name);
  const canOptOut = !["opted_out", "invalid"].includes(lead.status);
  const channel =
    lead.origin_channel === "website"
      ? "Website form"
      : lead.origin_channel === "granot"
        ? "Granot"
        : lead.origin_channel;

  const details: [string, string | null | undefined][] = [
    ["Phone", fmtPhone(lead.phone_e164)],
    ["Email", lead.email],
    ["Moving from", place(lead.from_city, lead.from_state)],
    ["Moving to", place(lead.to_city, lead.to_state)],
    ["Move date", lead.move_date ?? lead.move_date_note],
    ["Home size", lead.home_size],
    [
      "Zip codes",
      lead.from_zip || lead.to_zip
        ? `${lead.from_zip ?? "?"} to ${lead.to_zip ?? "?"}`
        : null,
    ],
    [
      "Contact preference",
      lead.contact_preference ? `Prefers ${lead.contact_preference}` : null,
    ],
    ["Lead source", lead.source],
    ["Came in through", channel],
    ["Granot job", lead.granot_job_number],
    ["Received", fmtTime(lead.created_at)],
    [
      "Time to first text",
      lead.first_text_at
        ? fmtSeconds(lead.seconds_to_first_text) +
          (lead.first_text_waited ? " (came in after hours, sent when contact hours opened)" : "")
        : null,
    ],
    ["Attempts", String(lead.attempt_count)],
    [
      "Follow-up attempt",
      lead.seq_attempt ? `${lead.seq_attempt} of the sequence` : null,
    ],
    [
      "Callback booked",
      lead.callback_at ? `${fmtTime(lead.callback_at)} ET` : null,
    ],
    ["Time to live call", fmtDuration(lead.seconds_to_connect)],
    ["Note", lead.status_reason],
  ];

  const hero = (
    <HeroTitle
      above={
        <nav className="mb-4 text-sm text-white/60" aria-label="Breadcrumb">
          <Link href="/ai-leads" className="hover:text-white">
            Leads
          </Link>
          <span className="mx-2 text-white/40">/</span>
          <span className="text-white">{name}</span>
        </nav>
      }
      title={
        <span className="flex flex-wrap items-center gap-3">
          {name}
          <StatusBadge status={lead.status} pref={lead.contact_preference} />
          {lead.is_test && (
            <span className="rounded-md bg-[#EDE9FE] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#5B21B6]">
              Test
            </span>
          )}
          {lead.archived_at && (
            <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
              Archived
            </span>
          )}
        </span>
      }
      description={
        moveLine(
          lead.from_city,
          lead.from_state,
          lead.to_city,
          lead.to_state,
        ) || "No move details yet"
      }
      actions={
        <a
          href={`tel:${lead.phone_e164}`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#E10600] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-black/30 hover:bg-[#C00500] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
          </svg>
          Call {fmtPhone(lead.phone_e164)}
        </a>
      }
    />
  );

  return (
    <Shell active="leads" hero={hero}>
      <LiveRefresh seconds={8} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card
            title="Conversation"
            description="Every text with this customer, plus the AI calls in between. Updates by itself."
            aside={
              <form action={setAiPaused} className="shrink-0">
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="pause" value={aiPaused ? "false" : "true"} />
                <PendingButton
                  pendingText={aiPaused ? "Resuming…" : "Pausing…"}
                  tone={aiPaused ? "light" : "dark"}
                  title={aiPaused ? "Hand this lead back to the AI" : "Stop the AI texting, calling and answering this lead"}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    aiPaused
                      ? "bg-[#16A34A] text-white hover:bg-[#15803D] focus-visible:outline-[#16A34A]"
                      : "bg-[#FFF4DB] text-[#B45309] hover:bg-[#FDE9B8] focus-visible:outline-[#B45309]"
                  }`}
                >
                  {aiPaused ? "Resume AI" : "Pause AI"}
                </PendingButton>
              </form>
            }
          >
            <p
              className={`flex items-start gap-2 border-b px-5 py-2.5 text-xs ${
                aiPaused ? "border-[#FBE3B0] bg-[#FFFBF0] text-[#92400E]" : "border-[#F0F0F0] text-[#525252]"
              }`}
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${aiPaused ? "bg-[#F59E0B]" : "bg-[#16A34A]"}`}
                aria-hidden
              />
              {aiPaused ? (
                <span>
                  <b>AI paused</b>
                  {lead.ai_paused_by ? ` by ${lead.ai_paused_by}` : ""}, {fmtTime(lead.ai_paused_at)} ET. It won&apos;t
                  text, call or answer this customer. Resume AI picks the follow-ups up where they stopped.
                </span>
              ) : (
                <span>
                  <b>AI on.</b> It follows up and answers this customer, and pauses by itself when someone on
                  the team sends a text.
                </span>
              )}
            </p>
            {thread.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[#737373]">
                No texts or calls yet.
              </p>
            ) : (
              <ThreadScroll count={thread.length}>
                <ol className="space-y-3 bg-[#FAFAFA] px-3 py-5 md:px-5">
                  {thread.map((item, i) => {
                    const day = fmtDay(item.at);
                    const newDay = i === 0 || fmtDay(thread[i - 1].at) !== day;
                    return (
                      <li key={item.type === "text" ? item.m.id : `e${i}`}>
                        {newDay && (
                          <p className="mb-3 mt-1 text-center text-[11px] font-bold uppercase tracking-wide text-[#A3A3A3]">
                            {day}
                          </p>
                        )}
                        {item.type === "text" ? (
                          <TextBubble m={item.m} />
                        ) : (
                          <EventRow a={item.a} />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </ThreadScroll>
            )}
            <ReplyBox leadId={lead.id} aiPaused={aiPaused} disabledReason={replyBlocked} />
          </Card>

          <Card>
            <div className="flex items-center gap-4 border-b border-[#F0F0F0] px-5 py-4">
              <Avatar name={name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{name}</p>
                <p className="text-sm text-[#737373]">
                  {lead.source ?? "Unknown source"}, received{" "}
                  {fmtTime(lead.created_at)} ET
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[repeat(2,minmax(0,1fr))]">
              {details.map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 border-b border-[#F0F0F0] px-5 py-3 text-sm sm:odd:border-r"
                >
                  <dt className="shrink-0 text-[#737373]">{label}</dt>
                  <dd className="min-w-0 break-words text-right font-semibold">
                    {value || (
                      <span className="font-normal text-[#A3A3A3]">—</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

        </div>

        <div className="space-y-6">
          <Card title="Scheduled">
            {tasks.length === 0 ? (
              <p className="px-5 py-5 text-sm text-[#737373]">
                Nothing scheduled.
              </p>
            ) : (
              <ul className="divide-y divide-[#F0F0F0]">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span
                        className={`h-2 w-2 rounded-full ${t.action === "call" ? "bg-[#E10600]" : t.action === "sms" ? "bg-[#1E1E1E]" : "bg-[#A3A3A3]"}`}
                      />
                      {t.reason === "callback"
                        ? "Booked callback"
                        : (TASK_LABEL[t.action] ?? t.action)}
                      {t.step_no ? (
                        <span className="font-normal text-[#737373]">
                          (attempt {t.step_no})
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-[#737373]">
                      {fmtTime(t.run_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {lead.status === "opted_out" && (
            <Card title="Contact this number again">
              <form action={manualOptIn} className="px-5 py-4">
                <input type="hidden" name="phone" value={lead.phone_e164} />
                <input type="hidden" name="leadId" value={lead.id} />
                <p className="text-sm text-[#737373]">
                  Removes this number from the AI opt-out list. Use it only if
                  the customer asked to receive messages again, or the opt-out
                  was a mistake.
                </p>
                <PendingButton
                  pendingText="Re-enabling…"
                  className="mt-4 rounded-xl bg-[#DCFCE7] px-4 py-2.5 text-sm font-bold text-[#166534] hover:bg-[#BBF7D0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#166534]"
                >
                  Re-enable {fmtPhone(lead.phone_e164)}
                </PendingButton>
              </form>
            </Card>
          )}

          {canOptOut && (
            <Card title="Stop contacting this number">
              <form action={manualOptOut} className="px-5 py-4">
                <input type="hidden" name="phone" value={lead.phone_e164} />
                <input type="hidden" name="leadId" value={lead.id} />
                <p className="text-sm text-[#737373]">
                  Cancels every scheduled text and call and blocks this number
                  for future leads. You can re-enable it later from this
                  page.
                </p>
                <PendingButton
                  pendingText="Opting out…"
                  className="mt-4 rounded-xl bg-[#FDECEB] px-4 py-2.5 text-sm font-bold text-[#B30500] hover:bg-[#FAD7D4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B30500]"
                >
                  Opt out {fmtPhone(lead.phone_e164)}
                </PendingButton>
              </form>
            </Card>
          )}

          <Card title="Test & archive">
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-[#737373]">
                Test and archived leads are not counted in the dashboard numbers. Archiving also cancels every
                scheduled text and call for this lead.
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={setTestLead}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="test" value={lead.is_test ? "false" : "true"} />
                  <PendingButton
                    pendingText="Saving…"
                    className="rounded-xl bg-[#EDE9FE] px-4 py-2.5 text-sm font-bold text-[#5B21B6] hover:bg-[#DDD6FE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B21B6]"
                  >
                    {lead.is_test ? "Not a test lead" : "Mark as test"}
                  </PendingButton>
                </form>
                <form action={archiveLead}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="archive" value={lead.archived_at ? "false" : "true"} />
                  <PendingButton
                    pendingText="Saving…"
                    className="rounded-xl bg-[#F0F0F0] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] hover:bg-[#E5E5E5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E1E1E]"
                  >
                    {lead.archived_at ? "Unarchive" : "Archive"}
                  </PendingButton>
                </form>
              </div>
              {(lead.is_test || lead.archived_at) && (
                <form action={deleteLead} className="border-t border-[#F0F0F0] pt-4">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <label className="flex items-start gap-2 text-sm text-[#3D3D3D]">
                    <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-4 w-4 accent-[#B30500]" />
                    Delete this lead and all its texts, calls and history for good.
                  </label>
                  <PendingButton
                    pendingText="Deleting…"
                    className="mt-3 rounded-xl bg-[#FDECEB] px-4 py-2.5 text-sm font-bold text-[#B30500] hover:bg-[#FAD7D4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B30500]"
                  >
                    Delete lead
                  </PendingButton>
                </form>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

/** Short duration that also reads well for a few seconds: "3 sec", "2 min 5 sec", "4 h 10 min". */
function fmtSeconds(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return "—";
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} sec`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} sec` : ""}`;
  const h = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${h} h${mins ? ` ${mins} min` : ""}`;
}

/** Vapi recordings are private: play them through our own route, which gets a signed link.
 *  The file name starts with the Vapi call id, e.g. ".../01a15d22-758b-788c-8cd6-1da3236beaf4-1792...-mono.wav" */
function recordingSrc(url: string) {
  const file = url.split("/").pop() ?? "";
  const m =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
      file,
    );
  return m ? `/ai-leads/recording/${m[1]}` : url;
}

function KindIcon({ kind }: { kind: Activity["kind"] }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "call")
    return (
      <svg {...common}>
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
      </svg>
    );
  if (kind === "transfer")
    return (
      <svg {...common}>
        <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      {kind === "sms_inbound" && <path d="M8 10h8" />}
    </svg>
  );
}
function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function fmtClock(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function TextBubble({ m }: { m: ThreadMessage }) {
  const s = SENDER[m.sender] ?? SENDER.ai;
  const mine = m.sender !== "customer";
  const failed = m.status === "failed" || m.status === "undelivered";
  const who = m.sender === "staff" ? `Staff${m.staff_name ? ` · ${m.staff_name}` : ""}` : s.label;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[88%] flex-col md:max-w-[75%] ${mine ? "items-end" : "items-start"}`}>
        <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-bold text-[#737373]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              m.sender === "customer" ? "bg-[#D97706]" : m.sender === "staff" ? "bg-[#E10600]" : "bg-[#1E1E1E]"
            }`}
            aria-hidden
          />
          {who}
        </p>
        <p className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${s.bubble}`}>
          {m.body || <span className="italic opacity-70">(no text)</span>}
        </p>
        <p className={`mt-1 px-1 text-[11px] ${failed ? "font-semibold text-[#B30500]" : "text-[#A3A3A3]"}`}>
          {fmtClock(m.at)} ET
          {mine && m.status ? ` · ${m.status.replace(/_/g, " ")}` : ""}
          {failed && m.error ? ` (${m.error})` : ""}
        </p>
      </div>
    </div>
  );
}

function EventRow({ a }: { a: Activity }) {
  const k = KIND[a.kind];
  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="flex max-w-full items-center gap-2 rounded-full border border-[#EBEBEB] bg-white px-3 py-1.5 text-xs text-[#525252] shadow-sm">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${k.icon}`}>
          <KindIcon kind={a.kind} />
        </span>
        <span className="font-bold">{k.label}</span>
        {a.status && <span className="truncate">· {a.status.replace(/_/g, " ")}</span>}
        <span className="shrink-0 text-[#A3A3A3]">· {fmtClock(a.at)}</span>
      </div>
      {a.detail && (
        <p className="max-w-xl whitespace-pre-wrap rounded-xl border border-[#EBEBEB] bg-white px-3 py-2 text-xs leading-relaxed text-[#525252]">
          {a.detail}
        </p>
      )}
      {a.recording_url && (
        <audio controls preload="none" src={recordingSrc(a.recording_url)} className="h-9 w-full max-w-sm" />
      )}
    </div>
  );
}