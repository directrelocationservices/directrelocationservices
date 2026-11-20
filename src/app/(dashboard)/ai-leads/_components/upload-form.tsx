// File: src/app/(dashboard)/ai-leads/_components/upload-form.tsx  (NEW file)
// (Row numbers match Excel: row 1 is the header row.)
//
// CSV lead upload:
//  1. pick a CSV  → columns are found by their header names
//  2. pick lead source, start date, how many new leads per day
//  3. Check file  → how many will be contacted / skipped (opted out) / duplicates / bad numbers
//  4. Start       → leads go into the normal follow-up, labeled "Upload"

"use client";

import { useMemo, useState, useTransition } from "react";
import { checkUpload, startUpload, type CheckResult, type UploadRow } from "../upload-actions";

type Field = keyof UploadRow;

const FIELD_LABEL: Record<Field, string> = {
  name: "Name",
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  email: "Email",
  move_from: "Move from",
  move_to: "Move to",
  move_date: "Move date",
  source: "Lead source (file)",
  lead_date: "Original lead date",
};

// header text (lowercase, letters/numbers only) → field
const ALIASES: Record<string, Field> = {
  name: "name", fullname: "name", customername: "name", customer: "name", contactname: "name", leadname: "name",
  firstname: "first_name", first: "first_name", fname: "first_name",
  lastname: "last_name", last: "last_name", lname: "last_name",
  phone: "phone", phonenumber: "phone", mobile: "phone", mobilephone: "phone", cell: "phone", cellphone: "phone",
  phone1: "phone", primaryphone: "phone", telephone: "phone", tel: "phone",
  email: "email", emailaddress: "email", mail: "email",
  movefrom: "move_from", from: "move_from", origin: "move_from", fromaddress: "move_from", pickup: "move_from",
  moveto: "move_to", to: "move_to", destination: "move_to", toaddress: "move_to", delivery: "move_to",
  movedate: "move_date", movingdate: "move_date", dateofmove: "move_date",
  leadsource: "source", source: "source",
  originalleaddate: "lead_date", leaddate: "lead_date", datecreated: "lead_date", createddate: "lead_date",
  created: "lead_date", createdat: "lead_date", date: "lead_date",
};
// separate city / state / zip columns are joined into "Move from" / "Move to"
const PLACE_PARTS: Record<string, ["move_from" | "move_to", number]> = {
  fromcity: ["move_from", 0], fromstate: ["move_from", 1], fromzip: ["move_from", 2], originzip: ["move_from", 2],
  tocity: ["move_to", 0], tostate: ["move_to", 1], tozip: ["move_to", 2], destinationzip: ["move_to", 2],
};

const STATUS_TEXT: Record<string, string> = {
  opted_out: "Opted out, skipped",
  duplicate: "Already in the system",
  duplicate_in_file: "Twice in this file",
  invalid_phone: "Missing or non-US phone",
};

/** Small CSV reader: quotes, commas and new lines inside quotes, Windows line ends. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function toRows(table: string[][]) {
  const [header, ...body] = table;
  const keys = (header ?? []).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const found: { header: string; field: string }[] = [];
  keys.forEach((k, i) => {
    if (ALIASES[k]) found.push({ header: header[i], field: FIELD_LABEL[ALIASES[k]] });
    else if (PLACE_PARTS[k]) found.push({ header: header[i], field: FIELD_LABEL[PLACE_PARTS[k][0]] });
  });
  const rows: UploadRow[] = body.map((cells) => {
    const r: UploadRow = {};
    const place: Record<"move_from" | "move_to", string[]> = { move_from: [], move_to: [] };
    keys.forEach((k, i) => {
      const v = (cells[i] ?? "").trim();
      if (!v) return;
      const f = ALIASES[k];
      if (f && !r[f]) r[f] = v;
      const p = PLACE_PARTS[k];
      if (p) place[p[0]][p[1]] = v;
    });
    for (const side of ["move_from", "move_to"] as const) {
      if (!r[side] && place[side].length) {
        const [city, state, zip] = place[side];
        r[side] = [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
      }
    }
    return r;
  });
  return { rows, found, hasPhone: keys.some((k) => ALIASES[k] === "phone") };
}

function fmtDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function UploadForm({ sources, defaultStart }: { sources: string[]; defaultStart: string }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [found, setFound] = useState<{ header: string; field: string }[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [limit, setLimit] = useState(100);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [done, setDone] = useState<{ created: number; lastDay: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useTransition();

  const days = useMemo(() => (check?.contact ? Math.ceil(check.contact / Math.max(limit, 1)) : 0), [check, limit]);

  const onFile = async (file: File | undefined) => {
    setCheck(null);
    setDone(null);
    setError(null);
    setFileError(null);
    setRows([]);
    setFound([]);
    if (!file) return;
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) return setFileError("Please choose a .csv file (in Excel: File → Save As → CSV).");
    const parsed = toRows(parseCsv(await file.text()));
    if (!parsed.hasPhone) return setFileError("No phone column found. The first row must have column names, one of them Phone.");
    if (parsed.rows.length === 0) return setFileError("The file has no rows under the header.");
    if (parsed.rows.length > 2000) return setFileError(`The file has ${parsed.rows.length.toLocaleString()} rows. Upload at most 2,000 at a time.`);
    setRows(parsed.rows);
    setFound(parsed.found);
  };

  const onCheck = () =>
    run(async () => {
      setError(null);
      setDone(null);
      const res = await checkUpload(rows);
      if (!res.ok) setError(res.error ?? "Couldn't check the file.");
      setCheck(res.ok ? res : null);
    });

  const onStart = () =>
    run(async () => {
      setError(null);
      const res = await startUpload({ rows, source, startDate: start, dailyLimit: limit, fileName });
      if (!res.ok) return setError(res.error ?? "Couldn't start the upload.");
      setDone({ created: res.created ?? 0, lastDay: res.lastDay ?? null });
      setCheck(null);
      setRows([]);
      setFound([]);
    });

  const input =
    "mt-1.5 block w-full rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2.5 text-[15px] focus:border-[#E10600] focus:outline-none focus:ring-2 focus:ring-[#E10600]/20";

  return (
    <div className="space-y-5 px-5 py-5">
      {done && (
        <div role="status" className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]">
          <b>Started {done.created.toLocaleString()} lead{done.created === 1 ? "" : "s"}.</b>{" "}
          {done.created > 0 && (
            <>
              First texts go out from {fmtDay(start)}
              {done.lastDay && done.lastDay !== start ? ` to ${fmtDay(done.lastDay)}` : ""}, during contact hours. They show in
              Leads under More → Uploaded.
            </>
          )}
        </div>
      )}

      {/* 1. File */}
      <div>
        <label htmlFor="csv" className="text-sm font-bold">
          1. CSV file
        </label>
        <p className="text-xs text-[#737373]">
          First row = column names. Columns used: name, phone, email, move from, move to, move date, lead source, original lead
          date. Up to 2,000 rows.
        </p>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="mt-2 block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-[#1E1E1E] file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-[#333]"
        />
        {fileError && <p className="mt-2 text-sm font-semibold text-[#B30500]">{fileError}</p>}
        {rows.length > 0 && (
          <div className="mt-3 rounded-xl bg-[#FAFAFA] px-4 py-3 text-sm">
            <p className="font-bold">{rows.length.toLocaleString()} rows found</p>
            <p className="mt-1 text-xs text-[#525252]">
              {Object.entries(
                found.reduce<Record<string, string[]>>((m, f) => ((m[f.field] ??= []).push(f.header), m), {}),
              )
                .map(([field, headers]) => `${field} (${headers.join(", ")})`)
                .join(" · ")}
            </p>
          </div>
        )}
      </div>

      {/* 2. Settings */}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-bold">
          2. Lead source
          <select value={source} onChange={(e) => setSource(e.target.value)} className={input}>
            <option value="">Choose…</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Start date
          <input type="date" value={start} min={defaultStart} onChange={(e) => setStart(e.target.value)} className={input} />
        </label>
        <label className="text-sm font-bold">
          New leads per day
          <input
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className={input}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-[#737373]">
        Leads are started a few at a time through each business day, so texts and AI calls are spread out. Only upload people who
        asked for a quote and can be contacted.
      </p>

      {/* 3. Check */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCheck}
          disabled={busy || rows.length === 0}
          className="w-full rounded-xl border border-[#1E1E1E] bg-white px-5 py-2.5 text-sm font-bold text-[#1E1E1E] hover:bg-[#1E1E1E] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {busy && !check ? "Checking…" : "3. Check file"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-[#B30500]">
          {error}
        </p>
      )}

      {check && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Will be contacted", value: check.contact ?? 0, cls: "bg-[#E7F6EC] text-[#15803D]" },
              { label: "Opted out (skipped)", value: check.opted_out ?? 0, cls: "bg-[#FDECEB] text-[#B30500]" },
              { label: "Duplicates (skipped)", value: check.duplicates ?? 0, cls: "bg-[#FFF4DB] text-[#B45309]" },
              { label: "Bad numbers (skipped)", value: check.invalid ?? 0, cls: "bg-[#F5F5F5] text-[#525252]" },
            ].map((b) => (
              <div key={b.label} className={`rounded-xl px-4 py-3 ${b.cls}`}>
                <p className="text-2xl font-extrabold tabular-nums">{b.value.toLocaleString()}</p>
                <p className="text-xs font-bold">{b.label}</p>
              </div>
            ))}
          </div>

          {(check.issues?.length ?? 0) > 0 && (
            <details className="rounded-xl border border-[#EBEBEB]">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold">
                See skipped rows{(check.issues?.length ?? 0) >= 50 ? " (first 50)" : ""}
              </summary>
              <ul className="max-h-64 divide-y divide-[#F0F0F0] overflow-y-auto text-sm">
                {check.issues!.map((r) => (
                  <li key={r.row} className="flex gap-x-3 px-4 py-2">
                    <span className="w-14 shrink-0 text-[#A3A3A3]">Row {r.row + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <span className="min-w-0 break-words">
                        {r.name || "—"} · {r.phone || "no phone"}
                      </span>
                      <span className="shrink-0 text-xs text-[#737373] sm:text-sm">{STATUS_TEXT[r.status] ?? r.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(check.contact ?? 0) > 0 ? (
            <div className="rounded-xl bg-[#FAFAFA] px-4 py-3">
              <p className="text-sm">
                <b>{(check.contact ?? 0).toLocaleString()}</b> lead{check.contact === 1 ? "" : "s"} will start from{" "}
                <b>{fmtDay(start)}</b>, {limit} per business day ({days} business day{days === 1 ? "" : "s"}), labeled{" "}
                <b>Upload</b>, source <b>{source || "—"}</b>.
              </p>
              <button
                type="button"
                onClick={onStart}
                disabled={busy || !source}
                className="mt-3 w-full rounded-xl bg-[#E10600] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#C00500] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {busy ? "Starting…" : `4. Start follow-up for ${(check.contact ?? 0).toLocaleString()} leads`}
              </button>
              {!source && <p className="mt-2 text-xs font-semibold text-[#B30500]">Choose a lead source first.</p>}
            </div>
          ) : (
            <p className="text-sm font-semibold text-[#737373]">No leads in this file can be contacted.</p>
          )}
        </div>
      )}
    </div>
  );
}