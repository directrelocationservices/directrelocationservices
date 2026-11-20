// File: src/app/(dashboard)/ai-leads/uploads/page.tsx  (NEW file — make the "uploads" folder)
//
// Uploads tab: upload a CSV of older leads, and see every past upload with its results.

import Link from "next/link";
import { db } from "@/lib/ai-leads/supabase";
import { requireUser } from "@/lib/ai-leads/auth";
import { Card, Empty, ErrorNote, HeroTitle, Shell, fmtTime } from "../_components/ui";
import { UploadForm } from "../_components/upload-form";

interface Upload {
  id: string;
  created_at: string;
  created_by: string | null;
  file_name: string | null;
  source: string;
  start_date: string;
  daily_limit: number;
  total_rows: number;
  created: number;
  skipped_opt_out: number;
  duplicates: number;
  invalid: number;
  contacted: number;
  said_yes: number;
  transferred: number;
  opted_out: number;
  in_progress: number;
}

/** Tomorrow's date in Eastern time, "YYYY-MM-DD" (uploads start the next business day by default) */
function tomorrowEt() {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function fmtDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function UploadsPage() {
  await requireUser();
  const supa = db();
  const [sourcesRes, settingsRes, listRes] = await Promise.all([
    supa.from("ai_lead_sources").select("name, enabled").order("name").returns<{ name: string; enabled: boolean }[]>(),
    supa.from("ai_settings").select("ai_enabled").eq("id", 1).single(),
    supa.rpc("ai_upload_list"),
  ]);
  const errors = [sourcesRes.error, listRes.error].filter((e) => e !== null).map((e) => e.message);
  const sources = (sourcesRes.data ?? []).filter((s) => s.enabled).map((s) => s.name);
  const uploads = (listRes.data ?? []) as Upload[];

  return (
    <Shell
      active="uploads"
      aiEnabled={settingsRes.data?.ai_enabled}
      hero={
        <HeroTitle
          title="Uploads"
          description="Upload older leads from a CSV. Opted-out numbers and duplicates are skipped, the rest go into the normal follow-up."
        />
      }
    >
      <ErrorNote messages={errors} />

      <div className="space-y-6">
        <Card title="Upload a CSV" description="Check the file first, then start the follow-up.">
          <UploadForm sources={sources} defaultStart={tomorrowEt()} />
        </Card>

        <Card
          title="Past uploads"
          description="How each uploaded list is doing."
          aside={
            uploads.length > 0 ? (
              <Link href="/ai-leads?status=uploaded" className="text-sm font-bold text-[#E10600] hover:underline">
                See uploaded leads →
              </Link>
            ) : undefined
          }
        >
          {uploads.length === 0 ? (
            <Empty title="No uploads yet" body="Uploaded lists show here with how many were contacted, said yes and were transferred." />
          ) : (
            <ul className="divide-y divide-[#F0F0F0]">
              {uploads.map((u) => {
                const skipped = u.skipped_opt_out + u.duplicates + u.invalid;
                return (
                  <li key={u.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="min-w-0 max-w-full truncate font-bold">{u.file_name || "CSV upload"}</p>
                      <p className="text-xs text-[#737373]">
                        {fmtTime(u.created_at)}
                        {u.created_by ? ` · ${u.created_by}` : ""}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-[#525252]">
                      {u.source} · from {fmtDay(u.start_date)} · {u.daily_limit}/day · {u.created.toLocaleString()} of{" "}
                      {u.total_rows.toLocaleString()} started
                      {skipped > 0 && (
                        <span className="text-[#737373]">
                          {" "}
                          (skipped: {[
                            u.skipped_opt_out && `${u.skipped_opt_out} opted out`,
                            u.duplicates && `${u.duplicates} duplicate`,
                            u.invalid && `${u.invalid} bad number`,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                          )
                        </span>
                      )}
                    </p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {[
                        { k: "Waiting / in progress", v: u.in_progress },
                        { k: "Contacted", v: u.contacted },
                        { k: "Said yes", v: u.said_yes },
                        { k: "Transferred", v: u.transferred },
                        { k: "Opted out", v: u.opted_out },
                      ].map((s) => (
                        <div key={s.k} className="rounded-xl bg-[#FAFAFA] px-3 py-2">
                          <dd className="text-lg font-extrabold tabular-nums">{Number(s.v).toLocaleString()}</dd>
                          <dt className="text-[11px] font-bold leading-tight text-[#737373]">{s.k}</dt>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}