// File: src/app/(dashboard)/ai-leads/upload-actions.ts  (NEW file)
//
// CSV lead upload: check the file (opt-outs, duplicates, bad numbers), then start the follow-up.
// (Errors now show the database reason, so problems are easy to find.)

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/ai-leads/auth";
import { db } from "@/lib/ai-leads/supabase";

export interface UploadRow {
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  move_from?: string;
  move_to?: string;
  move_date?: string;
  source?: string;
  lead_date?: string;
}

export interface CheckResult {
  ok: boolean;
  error?: string;
  total?: number;
  contact?: number;
  opted_out?: number;
  duplicates?: number;
  invalid?: number;
  issues?: { row: number; status: string; name: string | null; phone: string | null }[];
}

const MAX_ROWS = 2000;

function clean(rows: UploadRow[]) {
  return (rows ?? []).slice(0, MAX_ROWS).map((r) => {
    const out: UploadRow = {};
    for (const k of ["name", "first_name", "last_name", "phone", "email", "move_from", "move_to", "move_date", "source", "lead_date"] as const) {
      const v = r?.[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
    }
    return out;
  });
}

export async function checkUpload(rows: UploadRow[]): Promise<CheckResult> {
  await requireUser();
  if (!rows?.length) return { ok: false, error: "The file has no rows." };
  if (rows.length > MAX_ROWS) return { ok: false, error: `Upload at most ${MAX_ROWS.toLocaleString()} rows at a time.` };
  const { data, error } = await db().rpc("ai_upload_check", { p_rows: clean(rows) });
  if (error) return { ok: false, error: `Couldn't check the file (database: ${error.message}).` };
  const d = data as {
    total: number;
    ok: number;
    opted_out: number;
    duplicates: number;
    invalid: number;
    rows: { row: number; status: string; name: string | null; phone: string | null; raw_phone: string | null }[];
  };
  return {
    ok: true,
    total: d.total,
    contact: d.ok,
    opted_out: d.opted_out,
    duplicates: d.duplicates,
    invalid: d.invalid,
    issues: d.rows
      .filter((r) => r.status !== "ok")
      .slice(0, 50)
      .map((r) => ({ row: r.row, status: r.status, name: r.name, phone: r.phone ?? r.raw_phone })),
  };
}

export async function startUpload(input: {
  rows: UploadRow[];
  source: string;
  startDate: string;
  dailyLimit: number;
  fileName: string;
}): Promise<{ ok: boolean; error?: string; created?: number; lastDay?: string | null }> {
  const user = await requireUser();
  if (!input.source) return { ok: false, error: "Pick a lead source." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate ?? "")) return { ok: false, error: "Pick a start date." };
  const limit = Math.min(Math.max(Math.round(Number(input.dailyLimit) || 100), 1), 1000);
  const { data, error } = await db().rpc("ai_upload_commit", {
    p_rows: clean(input.rows),
    p_source: input.source,
    p_start: input.startDate,
    p_daily_limit: limit,
    p_user: user.email ?? null,
    p_file: (input.fileName ?? "").slice(0, 200),
  });
  if (error) return { ok: false, error: `Couldn't start the upload (database: ${error.message}).` };
  const res = data as { ok: boolean; reason?: string; created?: number; last_start_day?: string | null };
  if (!res?.ok) return { ok: false, error: res?.reason ?? "Couldn't start the upload." };
  revalidatePath("/ai-leads");
  revalidatePath("/ai-leads/uploads");
  return { ok: true, created: res.created ?? 0, lastDay: res.last_start_day ?? null };
}