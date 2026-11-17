// File: src/app/(dashboard)/ai-leads/date-range.ts  (NEW file)
//
// Date filters for the AI dashboard. Works in Eastern time (the business time zone).
// Each range has a "previous period" of the same length for the compare option.

const TZ = "America/New_York";

export const RANGES = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "custom", label: "Custom" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export interface Period {
  from: Date;
  to: Date; // end is exclusive
}

export interface ResolvedRange {
  key: RangeKey;
  current: Period | null; // null = all time
  previous: Period | null;
  label: string; // e.g. "Nov 1 – Nov 17"
  previousLabel: string;
  fromInput: string; // YYYY-MM-DD for the custom date inputs
  toInput: string;
}

/** Milliseconds to add to UTC to get Eastern wall-clock time at that moment. */
function tzOffset(ts: number): number {
  const p: Record<string, number> = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(new Date(ts))
    .forEach((x) => {
      if (x.type !== "literal") p[x.type] = Number(x.value);
    });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - ts;
}

/** Midnight Eastern of a calendar day. Month/day may overflow (e.g. day 0 = last day of previous month). */
function etMidnight(y: number, m: number, d: number): Date {
  const n = new Date(Date.UTC(y, m - 1, d));
  const guess = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  let t = guess - tzOffset(guess);
  const fix = guess - tzOffset(t);
  if (fix !== t) t = fix;
  return new Date(t);
}

/** Today's date in Eastern time. */
function etToday() {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(new Date())
    .forEach((x) => (p[x.type] = x.value));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), dow };
}

function parseDay(s: string | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

function ymd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function short(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(date);
}

function label(p: Period | null) {
  if (!p) return "All time";
  const last = new Date(p.to.getTime() - 1);
  const a = short(p.from);
  const b = short(last);
  return a === b ? a : `${a} – ${b}`;
}

export function resolveRange(range?: string, from?: string, to?: string): ResolvedRange {
  const t = etToday();
  const today = etMidnight(t.y, t.m, t.d);
  const tomorrow = etMidnight(t.y, t.m, t.d + 1);
  let key: RangeKey = (RANGES.find((r) => r.key === range)?.key ?? "all") as RangeKey;
  let current: Period | null = null;
  let previous: Period | null = null;

  if (key === "today") {
    current = { from: today, to: tomorrow };
    previous = { from: etMidnight(t.y, t.m, t.d - 1), to: today };
  } else if (key === "week") {
    const back = (t.dow + 6) % 7; // weeks start on Monday
    current = { from: etMidnight(t.y, t.m, t.d - back), to: tomorrow };
    previous = { from: etMidnight(t.y, t.m, t.d - back - 7), to: etMidnight(t.y, t.m, t.d - 6) };
  } else if (key === "month") {
    const start = etMidnight(t.y, t.m, 1);
    current = { from: start, to: tomorrow };
    // same days of last month (Nov 1–17 vs Oct 1–17), never past the start of this month
    const prevEnd = etMidnight(t.y, t.m - 1, t.d + 1);
    previous = { from: etMidnight(t.y, t.m - 1, 1), to: prevEnd < start ? prevEnd : start };
  } else if (key === "last_month") {
    current = { from: etMidnight(t.y, t.m - 1, 1), to: etMidnight(t.y, t.m, 1) };
    previous = { from: etMidnight(t.y, t.m - 2, 1), to: etMidnight(t.y, t.m - 1, 1) };
  } else if (key === "custom") {
    const a = parseDay(from);
    const b = parseDay(to) ?? a;
    if (!a || !b) {
      key = "all";
    } else {
      let s = etMidnight(a.y, a.m, a.d);
      let e = etMidnight(b.y, b.m, b.d + 1);
      if (e <= s) [s, e] = [etMidnight(b.y, b.m, b.d), etMidnight(a.y, a.m, a.d + 1)];
      current = { from: s, to: e };
      // same number of days right before (counted in calendar days, so daylight saving can't shift it)
      const days = Math.round((e.getTime() - s.getTime()) / 86400000);
      const sd = parseDay(ymd(s))!;
      previous = { from: etMidnight(sd.y, sd.m, sd.d - days), to: s };
    }
  }

  return {
    key,
    current,
    previous,
    label: label(current),
    previousLabel: label(previous),
    fromInput: current ? ymd(current.from) : "",
    toInput: current ? ymd(new Date(current.to.getTime() - 1)) : "",
  };
}

/** RPC arguments for a period (null = all time). */
export function rangeArgs(p: Period | null) {
  return { p_from: p ? p.from.toISOString() : null, p_to: p ? p.to.toISOString() : null };
}

/** "+25%" style change from previous to current. null when there is nothing to compare. */
export function change(current: number, previous: number): { text: string; up: boolean | null } | null {
  if (previous === 0 && current === 0) return { text: "no change", up: null };
  if (previous === 0) return { text: "new", up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "no change", up: null };
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, up: pct > 0 };
}