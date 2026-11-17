// File: src/app/(dashboard)/ai-leads/lead-admin-actions.ts  (NEW file)
//
// Lead page buttons: mark as test, archive / unarchive, delete (test or archived leads only).

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/ai-leads/auth";
import { db } from "@/lib/ai-leads/supabase";

function leadIdFrom(formData: FormData) {
  const id = String(formData.get("leadId") ?? "").trim();
  if (!id) throw new Error("Missing lead.");
  return id;
}

function refresh(id: string) {
  revalidatePath("/ai-leads");
  revalidatePath(`/ai-leads/${id}`);
}

export async function setTestLead(formData: FormData): Promise<void> {
  await requireUser();
  const id = leadIdFrom(formData);
  const test = formData.get("test") === "true";
  const { error } = await db().rpc("ai_set_test_lead", { p_lead: id, p_test: test });
  if (error) throw new Error("Couldn't update this lead. Please try again.");
  refresh(id);
}

export async function archiveLead(formData: FormData): Promise<void> {
  await requireUser();
  const id = leadIdFrom(formData);
  const archive = formData.get("archive") === "true";
  const { error } = await db().rpc("ai_archive_lead", { p_lead: id, p_archive: archive });
  if (error) throw new Error("Couldn't update this lead. Please try again.");
  refresh(id);
}

export async function deleteLead(formData: FormData): Promise<void> {
  await requireUser();
  const id = leadIdFrom(formData);
  if (formData.get("confirm") !== "yes") throw new Error("Please tick the box to confirm.");
  const { data, error } = await db().rpc("ai_delete_lead", { p_lead: id });
  if (error) throw new Error("Couldn't delete this lead. Please try again.");
  const res = data as { ok: boolean; reason?: string } | null;
  if (!res?.ok) throw new Error(res?.reason ?? "Couldn't delete this lead.");
  revalidatePath("/ai-leads");
  redirect("/ai-leads?status=archived");
}