// File: src/app/(dashboard)/ai-leads/page.tsx  (REPLACE existing file)
// Leads list: archived leads hidden (Archived tab), "Test" tab and tag, stats leave out test + archived leads
// + Opt-outs card: opt-out rate by lead source and by follow-up attempt
// + Date filters (Today, This week, This month, Last month, Custom) with compare to previous period
// + "Avg. time to first text" (leads that came in after hours are left out)
// + Card list on phones and tablets, table from 1024px wide
// + Test tab also shows test leads that are archived
// + "Uploaded" filter and an UPLOAD tag on leads that came from a CSV upload
// + "Needs reply" tab and a red "N new" badge on leads with unread customer replies; updates by itself

import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/ai-leads/supabase";
import {
  Avatar,
  Card,
  Empty,
  ErrorNote,
  HeroTitle,
  display,
  Shell,
  StatusBadge,
  fmtDuration,
  fmtPhone,
  fmtTime,
  fullName,
  moveLine,
} from "./_components/ui";
import { DetailsMenu } from "./_components/details-menu";
import { LiveRefresh } from "./_components/live-refresh";
import { RANGES, change, rangeArgs, resolveRange } from "./date-range";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs reply" },
  { key: "live", label: "In progress" },
  { key: "transferred", label: "Transferred" },
  { key: "missed_transfer", label: "Missed transfer" },
  { key: "opted_out", label: "Opted out" },
  { key: "unresponsive", label: "No response" },
  { key: "prefers_contact", label: "Text / email" },
  { key: "excluded", label: "Source off" },
  { key: "no_consent", label: "No consent" },
  { key: "unreachable", label: "Unreachable" },
  { key: "booked", label: "Booked" },
  { key: "with_sales", label: "With sales" },
  { key: "uploaded", label: "Uploaded" },
  { key: "test", label: "Test" },
  { key: "archived", label: "Archived" },
];
// Tabs always shown; the rest go in the "More" menu (grouped)
const MAIN_TABS = ["all", "needs_reply", "live", "transferred", "opted_out", "unresponsive"];
const MORE_GROUPS = [
  ["missed_transfer", "prefers_contact", "unreachable", "booked", "with_sales"],
  ["excluded", "no_consent"],
  ["test", "archived"],
];
const LIVE = [
  "new",
  "held",
  "active",
  "opted_in",
  "missed_transfer",
  "callback_scheduled",
];
const NEXT_ACTION: Record<string, string> = {
  sms: "Text",
  call: "AI call",
  mark_unresponsive: "Close out",
};
const SOURCE_BARS = [
  "bg-[#E10600]",
  "bg-[#1E1E1E]",
  "bg-[#F59E0B]",
  "bg-[#16A34A]",
  "bg-[#2563EB]",
  "bg-[#8A8A8A]",
];

interface Metrics {
  leads_total: number;
  leads_active: number;
  leads_held: number;
  opted_in: number;
  opted_out: number;
  unresponsive: number;
  excluded: number;
  transferred: number;
  missed_transfers: number;
  conversion_pct: number | null;
  avg_seconds_to_connect: number | null;
  contacted: number | null;
  avg_seconds_to_first_text: number | null;
}

interface SourceRow {
  source: string;
  leads: number;
  contacted: number;
  said_yes: number;
  transferred: number;
  opted_out: number;
  unresponsive: number;
  transfer_rate_pct: number | null;
}

interface OptOutSourceRow {
  source: string;
  contacted: number;
  opted_out: number;
  opted_out_on_call: number;
  opted_out_by_text: number;
  opt_out_pct: number | null;
}

interface OptOutAttemptRow {
  attempt_no: number;
  reached: number;
  opted_out: number;
  opt_out_pct: number | null;
  share_of_opt_outs: number | null;
}

interface LeadRow {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  phone_e164: string;
  from_city: string | null;
  from_state: string | null;
  to_city: string | null;
  to_state: string | null;
  source: string | null;
  status: string;
  contact_preference: string | null;
  attempt_count: number;
  next_action: string | null;
  next_action_at: string | null;
  seconds_to_connect: number | null;
  is_test: boolean;
  origin_channel: string | null;
  archived_at: string | null;
  unread_count: number;
  ai_paused_at: string | null;
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

/** Red "2 new" badge for unread customer replies */
function UnreadTag({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#E10600] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-white">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" aria-hidden />
      {n} new
    </span>
  );
}

function UploadTag() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-[#E0F2FE] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[#0369A1]">
      Upload
    </span>
  );
}

function TestTag() {
  return (
    <span className="ml-2 inline-flex items-center rounded-md bg-[#EDE9FE] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[#5B21B6]">
      Test
    </span>
  );
}

export default async function AiLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; range?: string; from?: string; to?: string; compare?: string }>;
}) {
  const { status = "all", q = "", range = "all", from = "", to = "", compare = "" } = await searchParams;
  const supa = db();
  const R = resolveRange(range, from, to);
  const comparing = compare === "1" && R.previous !== null;

  /** Link to this page, keeping the current filters and changing only what is passed. */
  const href = (change: Record<string, string>) => {
    const p = new URLSearchParams();
    const all: Record<string, string> = { status, q, range: R.key === "all" && range !== "custom" ? "" : range, from: R.key === "custom" ? R.fromInput : "", to: R.key === "custom" ? R.toInput : "", compare: comparing ? "1" : "", ...change };
    Object.entries(all).forEach(([k, v]) => {
      if (v && !(k === "status" && v === "all")) p.set(k, v);
    });
    const qs = p.toString();
    return `/ai-leads${qs ? `?${qs}` : ""}`;
  };

  let query = supa
    .from("v_ai_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "archived") query = query.not("archived_at", "is", null);
  else if (status !== "test") query = query.is("archived_at", null); // Test tab shows archived test leads too
  if (status === "needs_reply") query = query.gt("unread_count", 0);
  else if (status === "live") query = query.in("status", LIVE);
  else if (status === "test") query = query.eq("is_test", true);
  else if (status === "uploaded") query = query.eq("origin_channel", "upload");
  else if (status !== "all" && status !== "archived" && status !== "needs_reply") query = query.eq("status", status);
  if (R.current) {
    query = query.gte("created_at", R.current.from.toISOString()).lt("created_at", R.current.to.toISOString());
  }
  if (q.trim()) {
    const term = q.trim().replace(/[%,()]/g, "");
    const digits = term.replace(/\D/g, "");
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone_e164.ilike.%${digits || term}%,granot_job_number.ilike.%${term}%`,
    );
  }

  const cur = rangeArgs(R.current);
  const [metricsRes, sourcesRes, leadsRes, settingsRes, optSrcRes, optAttRes, prevRes, unreadRes] = await Promise.all([
    supa.rpc("ai_metrics_range", cur).single(),
    supa.rpc("ai_source_report_range", cur),
    query.returns<LeadRow[]>(),
    supa
      .from("ai_settings")
      .select("ai_enabled")
      .eq("id", 1)
      .single<{ ai_enabled: boolean }>(),
    supa.rpc("ai_optout_by_source_range", cur),
    supa.rpc("ai_optout_by_attempt_range", cur),
    comparing
      ? supa.rpc("ai_metrics_range", rangeArgs(R.previous)).single()
      : Promise.resolve({ data: null as Metrics | null, error: null }),
    supa
      .from("v_ai_leads")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .gt("unread_count", 0),
  ]);

  const errors = [
    metricsRes.error,
    sourcesRes.error,
    leadsRes.error,
    settingsRes.error,
    optSrcRes.error,
    optAttRes.error,
    prevRes.error,
    unreadRes.error,
  ]
    .filter((e) => e !== null)
    .map((e) => e.message);
  const m = metricsRes.data as Metrics | null;
  const prev = comparing ? (prevRes.data as Metrics | null) : null;
  const sources = (sourcesRes.data ?? []) as SourceRow[];
  const leads = leadsRes.data ?? [];
  const aiEnabled = settingsRes.data?.ai_enabled;
  const needsReply = unreadRes.count ?? 0;
  const optBySource = (optSrcRes.data ?? []) as OptOutSourceRow[];
  const optByAttempt = ((optAttRes.data ?? []) as OptOutAttemptRow[]).filter((r) => r.reached > 0);
  const optTotal = optBySource.reduce((n, r) => n + r.opted_out, 0);
  const optContacted = optBySource.reduce((n, r) => n + r.contacted, 0);
  const optMaxPct = Math.max(1, ...optByAttempt.map((r) => r.opt_out_pct ?? 0));
  const filtered = q.trim() !== "" || status !== "all" || R.current !== null;
  const tabHref = (key: string) => href({ status: key });
  const activeRange = range === "custom" ? "custom" : R.key;
  const moreActive = MAIN_TABS.includes(status)
    ? undefined
    : FILTERS.find((f) => f.key === status);

  const total = m?.leads_total ?? 0;
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const stats: {
    label: string;
    value: number;
    pct: number;
    note: string;
    prev?: number;
    color: string;
    tint: string;
    bar: string;
    icon: ReactNode;
  }[] = [
    {
      label: "New leads",
      value: total,
      prev: prev?.leads_total,
      pct: total ? 100 : 0,
      note: `${m?.leads_active ?? 0} in progress right now`,
      color: "text-[#1E1E1E]",
      tint: "bg-[#EDEDED]",
      bar: "bg-[#1E1E1E]",
      icon: (
        <path d="M4 13h4l2 3h4l2-3h4M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      ),
    },
    {
      label: "Contacted",
      value: m?.contacted ?? 0,
      prev: prev?.contacted ?? undefined,
      pct: share(m?.contacted ?? 0),
      note: `${share(m?.contacted ?? 0)}% of all leads`,
      color: "text-[#D97706]",
      tint: "bg-[#FFF4DB]",
      bar: "bg-[#F59E0B]",
      icon: (
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      ),
    },
    {
      label: "Said yes",
      value: m?.opted_in ?? 0,
      prev: prev?.opted_in,
      pct: share(m?.opted_in ?? 0),
      note: `${share(m?.opted_in ?? 0)}% of all leads`,
      color: "text-[#E10600]",
      tint: "bg-[#FDECEB]",
      bar: "bg-[#E10600]",
      icon: <path d="M20 6L9 17l-5-5" />,
    },
    {
      label: "Transferred live",
      value: m?.transferred ?? 0,
      prev: prev?.transferred,
      pct: share(m?.transferred ?? 0),
      note: `${m?.conversion_pct ?? 0}% conversion${prev ? ` (was ${prev.conversion_pct ?? 0}%)` : ""}`,
      color: "text-[#16A34A]",
      tint: "bg-[#E7F6EC]",
      bar: "bg-[#16A34A]",
      icon: (
        <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      ),
    },
  ];

  const facts = [
    {
      label: "Avg. time to first text",
      value:
        fmtSeconds(m?.avg_seconds_to_first_text) +
        (prev ? ` (was ${fmtSeconds(prev.avg_seconds_to_first_text)})` : ""),
      dot: "bg-[#16A34A]",
    },
    {
      label: "Avg. time to live call",
      value: fmtDuration(m?.avg_seconds_to_connect) + (prev ? ` (was ${fmtDuration(prev.avg_seconds_to_connect)})` : ""),
      dot: "bg-[#1E1E1E]",
    },
    {
      label: "Missed transfers",
      value: String(m?.missed_transfers ?? 0),
      dot: "bg-[#F59E0B]",
    },
    {
      label: "Opted out",
      value: String(m?.opted_out ?? 0),
      dot: "bg-[#E10600]",
    },
    {
      label: "No response",
      value: String(m?.unresponsive ?? 0),
      dot: "bg-[#A3A3A3]",
    },
    {
      label: "Waiting for open",
      value: String(m?.leads_held ?? 0),
      dot: "bg-[#2563EB]",
    },
  ];

  return (
    <Shell
      active="leads"
      aiEnabled={aiEnabled}
      hero={
        <HeroTitle
          title="Leads"
          description={`Every lead the AI is texting and calling, newest first. Times are Eastern. Test and archived leads are not counted in the numbers. Showing: ${R.label}${comparing ? `, compared with ${R.previousLabel}` : ""}.`}
          actions={
            <div className="flex w-full flex-col items-start gap-2.5 md:w-auto md:items-end">
              <nav className="flex flex-wrap gap-1 rounded-xl bg-white/10 p-1" aria-label="Date range">
                {RANGES.map((r) => {
                  const on = activeRange === r.key;
                  return (
                    <Link
                      key={r.key}
                      href={href({ range: r.key === "all" ? "" : r.key, from: "", to: "", compare: r.key === "all" ? "" : comparing ? "1" : "" })}
                      aria-current={on ? "page" : undefined}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                        on ? "bg-white text-[#1E1E1E] shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {r.label}
                    </Link>
                  );
                })}
              </nav>
              {activeRange === "custom" && (
                <form action="/ai-leads" className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="range" value="custom" />
                  {status !== "all" && <input type="hidden" name="status" value={status} />}
                  {q && <input type="hidden" name="q" value={q} />}
                  {comparing && <input type="hidden" name="compare" value="1" />}
                  <label className="sr-only" htmlFor="range-from">From</label>
                  <input id="range-from" type="date" name="from" defaultValue={R.fromInput} required className="rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm text-[#1E1E1E]" />
                  <span className="text-sm text-white/60">to</span>
                  <label className="sr-only" htmlFor="range-to">To</label>
                  <input id="range-to" type="date" name="to" defaultValue={R.toInput} required className="rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm text-[#1E1E1E]" />
                  <button type="submit" className="rounded-lg bg-[#E10600] px-3.5 py-1.5 text-sm font-bold text-white hover:bg-[#C00500]">
                    Apply
                  </button>
                </form>
              )}
              {R.current && (
                <Link
                  href={href({ compare: comparing ? "" : "1" })}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white"
                >
                  <span className={`grid h-4 w-4 place-items-center rounded border ${comparing ? "border-white bg-white text-[#1E1E1E]" : "border-white/50"}`}>
                    {comparing && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  Compare to previous period ({R.previousLabel})
                </Link>
              )}
            </div>
          }
        />
      }
    >
      <LiveRefresh seconds={20} />
      {/* Stat cards (overlap the gradient) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#737373]">{s.label}</p>
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl ${s.tint} ${s.color}`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {s.icon}
                </svg>
              </span>
            </div>
            <p
              className={`${display.className} mt-2 text-4xl font-extrabold italic tracking-tight tabular-nums md:text-5xl`}
            >
              {s.value.toLocaleString()}
            </p>
            {s.prev !== undefined && (() => {
              const c = change(s.value, s.prev);
              if (!c) return null;
              return (
                <p className="mt-1 text-xs font-semibold">
                  <span className={c.up === null ? "text-[#737373]" : c.up ? "text-[#16A34A]" : "text-[#E10600]"}>
                    {c.up === null ? "" : c.up ? "▲ " : "▼ "}
                    {c.text}
                  </span>
                  <span className="font-medium text-[#A3A3A3]"> vs {s.prev.toLocaleString()} before</span>
                </p>
              );
            })()}
            <div
              className={`mt-4 h-1.5 overflow-hidden rounded-full ${s.tint}`}
            >
              <div
                className={`h-full rounded-full ${s.bar}`}
                style={{ width: `${s.pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-[#737373]">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {facts.map((f) => (
          <span
            key={f.label}
            className="inline-flex items-center gap-2 rounded-full border border-[#E5E5E5] bg-white px-3.5 py-1.5 text-sm shadow-sm"
          >
            <span className={`h-2 w-2 rounded-full ${f.dot}`} />
            <span className="text-[#737373]">{f.label}</span>
            <span className="font-bold tabular-nums">{f.value}</span>
          </span>
        ))}
      </div>

      <div className="mt-8">
        <ErrorNote messages={errors} />
        {aiEnabled === false && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FBD68A] bg-[#FFF8E6] px-5 py-3.5 text-sm">
            <span className="text-[#92400E]">
              <span className="font-bold">AI outreach is paused.</span> New
              leads are saved but nobody is texted or called.
            </span>
            <Link
              href="/ai-leads/sources"
              className="font-bold text-[#92400E] underline underline-offset-2"
            >
              Open settings
            </Link>
          </div>
        )}
      </div>

      {/* Opt-outs */}
      <Card
        title="Opt-outs"
        description={`${R.current ? `${R.label}: ` : ""}${optTotal} of ${optContacted} contacted leads opted out${optContacted ? ` (${Math.round((optTotal / optContacted) * 1000) / 10}%)` : ""}. Test and archived leads are not counted.`}
        className="mb-6"
      >
        {optContacted === 0 ? (
          <Empty title="No data yet" body="Opt-outs show up here once leads are contacted." />
        ) : (
          <div className="grid lg:grid-cols-5">
            {/* By source */}
            <div className="min-w-0 border-b border-[#F0F0F0] p-5 lg:col-span-2 lg:border-b-0 lg:border-r">
              <h3 className="text-sm font-bold">By lead source</h3>
              <p className="mt-0.5 text-xs text-[#737373]">Opted out ÷ leads we texted or called</p>
              <ul className="mt-4 space-y-4">
                {optBySource.map((r) => (
                  <li key={r.source}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-semibold">{r.source}</span>
                      <span className="shrink-0 font-extrabold tabular-nums">
                        {r.opt_out_pct === null ? "—" : `${r.opt_out_pct}%`}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F0F0F0]">
                      <div
                        className="h-full rounded-full bg-[#E10600]"
                        style={{ width: `${Math.min(r.opt_out_pct ?? 0, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-[#737373]">
                      {r.opted_out} of {r.contacted} contacted
                      {r.opted_out > 0 && ` · ${r.opted_out_by_text} by text, ${r.opted_out_on_call} on a call`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* By attempt */}
            <div className="min-w-0 p-5 lg:col-span-3">
              <h3 className="text-sm font-bold">By follow-up attempt</h3>
              <p className="mt-0.5 text-xs text-[#737373]">
                Opted out on that attempt ÷ leads that reached it. A tall bar shows where follow-up may feel like too much.
              </p>
              <div className="mt-4">
                <div
                  className="grid h-44 items-end gap-1 sm:gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${optByAttempt.length || 1}, minmax(0, 1fr))` }}
                >
                  {optByAttempt.map((r) => {
                    const pct = r.opt_out_pct ?? 0;
                    return (
                      <div
                        key={r.attempt_no}
                        className="flex h-full flex-col items-center justify-end gap-1"
                        title={`Attempt ${r.attempt_no}: ${r.opted_out} of ${r.reached} opted out`}
                      >
                        <span className={`text-[10px] font-bold tabular-nums sm:text-[11px] ${pct > 0 ? "text-[#171717]" : "text-[#C4C4C4]"}`}>
                          {pct > 0 ? `${Math.round(pct)}%` : "0"}
                        </span>
                        <span
                          className={`w-full max-w-9 rounded-t-md ${pct > 0 ? "bg-[#E10600]" : "bg-[#EDEDED]"}`}
                          style={{ height: pct > 0 ? `${Math.max((pct / optMaxPct) * 100, 6)}%` : "4px" }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div
                  className="mt-2 grid gap-1 border-t border-[#F0F0F0] pt-2 sm:gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${optByAttempt.length || 1}, minmax(0, 1fr))` }}
                >
                  {optByAttempt.map((r) => (
                    <div key={r.attempt_no} className="text-center">
                      <p className="text-xs font-semibold">{r.attempt_no}</p>
                      <p className="text-[9px] text-[#A3A3A3] tabular-nums sm:text-[10px]">{r.opted_out}/{r.reached}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-center text-[11px] text-[#A3A3A3]">Attempt number · opted out / reached</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-4">
        {/* Leads */}
        <Card className="min-w-0 xl:col-span-3">
          <div className="flex flex-col gap-3 border-b border-[#F0F0F0] p-4 md:px-5">
            <nav
              className="flex flex-wrap items-center gap-1"
              aria-label="Filter leads"
            >
              {FILTERS.filter((f) => MAIN_TABS.includes(f.key)).map((f) => {
                const on = status === f.key;
                return (
                  <Link
                    key={f.key}
                    href={tabHref(f.key)}
                    aria-current={on ? "page" : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      on
                        ? "bg-[#1E1E1E] text-white shadow-sm"
                        : "text-[#737373] hover:bg-[#F0F0F0] hover:text-[#171717]"
                    }`}
                  >
                    {f.label}
                    {f.key === "needs_reply" && needsReply > 0 && (
                      <span
                        className={`ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                          on ? "bg-white text-[#E10600]" : "bg-[#E10600] text-white"
                        }`}
                      >
                        {needsReply}
                      </span>
                    )}
                  </Link>
                );
              })}

              {/* Everything else sits in one "More" menu so the row stays short */}
              <DetailsMenu key={status} className="relative">
                <summary
                  className={`flex cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors [&::-webkit-details-marker]:hidden ${
                    moreActive
                      ? "bg-[#1E1E1E] text-white shadow-sm"
                      : "text-[#737373] hover:bg-[#F0F0F0] hover:text-[#171717]"
                  }`}
                >
                  {moreActive ? moreActive.label : "More"}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="z-20 mt-2 rounded-xl max-sm:fixed max-sm:inset-x-4 sm:absolute sm:left-0 sm:w-56 border border-[#E5E5E5] bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
                  {MORE_GROUPS.map((group, gi) => (
                    <div
                      key={gi}
                      className={gi > 0 ? "mt-1.5 border-t border-[#F0F0F0] pt-1.5" : ""}
                    >
                      {FILTERS.filter((f) => group.includes(f.key)).map((f) => {
                        const on = status === f.key;
                        return (
                          <Link
                            key={f.key}
                            href={tabHref(f.key)}
                            aria-current={on ? "page" : undefined}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
                              on
                                ? "bg-[#FDECEB] text-[#E10600]"
                                : "text-[#3D3D3D] hover:bg-[#F5F5F5]"
                            }`}
                          >
                            {f.label}
                            {on && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </DetailsMenu>
            </nav>
            <form action="/ai-leads" className="relative w-full">
              <input type="hidden" name="status" value={status} />
              <label htmlFor="lead-search" className="sr-only">
                Search leads
              </label>
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A3A3A3]"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                id="lead-search"
                name="q"
                defaultValue={q}
                placeholder="Name, phone or job number"
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] py-2.5 pl-9 pr-3 text-sm placeholder:text-[#A3A3A3] focus:border-[#E10600] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]/20"
              />
            </form>
          </div>

          {leads.length === 0 ? (
            <Empty
              title={filtered ? "No leads match" : "No leads yet"}
              body={
                filtered
                  ? "Try a different tab or clear the search."
                  : "As soon as a lead comes in from Granot or the website form, it shows up here."
              }
            />
          ) : (
            <>
              {/* Mobile */}
              <ul className="divide-y divide-[#F0F0F0] lg:hidden">
                {leads.map((l) => {
                  const name = fullName(l.first_name, l.last_name);
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/ai-leads/${l.id}`}
                        className="flex gap-3 px-4 py-4 active:bg-[#FAFAFA]"
                      >
                        <Avatar name={name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">
                                {name}
                                {l.is_test && <TestTag />}
                                {l.origin_channel === "upload" && <UploadTag />}
                                <UnreadTag n={l.unread_count} />
                              </p>
                              <p className="text-sm text-[#737373]">
                                {fmtPhone(l.phone_e164)}
                              </p>
                            </div>
                            <StatusBadge
                              status={l.status}
                              pref={l.contact_preference}
                            />
                          </div>
                          <p className="mt-2 text-sm text-[#3D3D3D]">
                            {moveLine(
                              l.from_city,
                              l.from_state,
                              l.to_city,
                              l.to_state,
                            ) || "No move details"}
                          </p>
                          <p className="mt-1 text-xs text-[#737373]">
                            {fmtTime(l.created_at)} from{" "}
                            {l.source ?? "unknown source"}
                          </p>
                          {l.next_action && (
                            <p className="mt-1 text-xs font-semibold text-[#E10600]">
                              Next:{" "}
                              {NEXT_ACTION[l.next_action] ?? l.next_action},{" "}
                              {fmtTime(l.next_action_at)}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-semibold text-[#A3A3A3]">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Customer</th>
                      <th className="px-4 py-3 font-semibold">Move</th>
                      <th className="px-4 py-3 font-semibold">Source</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Next step</th>
                      <th className="px-5 py-3 text-right font-semibold">
                        Received
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0]">
                    {leads.map((l) => {
                      const name = fullName(l.first_name, l.last_name);
                      return (
                        <tr
                          key={l.id}
                          className="transition-colors hover:bg-[#FAFAFA]"
                        >
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/ai-leads/${l.id}`}
                              className="group flex items-center gap-3"
                            >
                              <Avatar name={name} />
                              <span className="min-w-0">
                                <span className="block font-bold group-hover:text-[#E10600]">
                                  {name}
                                  {l.is_test && <TestTag />}
                                {l.origin_channel === "upload" && <UploadTag />}
                                  <UnreadTag n={l.unread_count} />
                                </span>
                                <span className="block tabular-nums text-[#737373]">
                                  {fmtPhone(l.phone_e164)}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="max-w-[260px] px-4 py-3.5 text-[#3D3D3D]">
                            <p className="truncate">
                              {moveLine(
                                l.from_city,
                                l.from_state,
                                l.to_city,
                                l.to_state,
                              ) || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-[#3D3D3D]">
                            {l.source ?? "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge
                              status={l.status}
                              pref={l.contact_preference}
                            />
                            <p className="mt-1 text-xs text-[#737373]">
                              {l.status === "transferred" &&
                              l.seconds_to_connect !== null
                                ? `Connected in ${fmtDuration(l.seconds_to_connect)}`
                                : `${l.attempt_count} ${l.attempt_count === 1 ? "attempt" : "attempts"}`}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            {l.next_action ? (
                              <>
                                <p className="font-semibold text-[#E10600]">
                                  {NEXT_ACTION[l.next_action] ?? l.next_action}
                                </p>
                                <p className="text-xs text-[#737373]">
                                  {fmtTime(l.next_action_at)}
                                </p>
                              </>
                            ) : (
                              <span className="text-[#A3A3A3]">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-right text-[#737373]">
                            {fmtTime(l.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {/* Sources */}
        <Card
          title="By lead source"
          className="self-start xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto"
          aside={
            <Link
              href="/ai-leads/sources"
              className="text-sm font-bold text-[#E10600] hover:text-[#C00500]"
            >
              Manage
            </Link>
          }
        >
          {sources.length === 0 ? (
            <Empty
              title="No sources yet"
              body="Each source shows up here with its transfer rate."
            />
          ) : (
            <ul className="space-y-5 p-5">
              {sources.map((s, i) => (
                <li key={s.source}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${SOURCE_BARS[i % SOURCE_BARS.length]}`}
                      />
                      <span className="truncate">{s.source}</span>
                    </span>
                    <span className="shrink-0 font-extrabold tabular-nums">
                      {s.transfer_rate_pct === null ? (
                        <span className="font-semibold text-[#A3A3A3]">—</span>
                      ) : (
                        `${s.transfer_rate_pct}%`
                      )}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F0F0F0]">
                    <div
                      className={`h-full rounded-full ${SOURCE_BARS[i % SOURCE_BARS.length]}`}
                      style={{
                        width: `${Math.min(s.transfer_rate_pct ?? 0, 100)}%`,
                      }}
                    />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-1.5">
                    {[
                      ["Leads", s.leads],
                      ["Contacted", s.contacted],
                      ["Said yes", s.said_yes],
                      ["Transferred", s.transferred],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-[#F5F5F5] px-2.5 py-1.5"
                      >
                        <dt className="truncate text-xs text-[#737373]">
                          {label}
                        </dt>
                        <dd className="text-sm font-extrabold tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {(s.opted_out > 0 || s.unresponsive > 0) && (
                    <p className="mt-1.5 text-xs text-[#737373]">
                      {s.opted_out} opted out, {s.unresponsive} no response
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

    </Shell>
  );
}