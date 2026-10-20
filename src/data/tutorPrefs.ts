// The tutor's settings on this device: your Claude API key (never in a backup), a monthly cap and how
// hard it thinks. Kept apart from the Claude library so the rest of the app loads without it.

import { kvGet, kvSet } from "./db";

export interface TutorPrefs { key: string | null; cap: number; effort: "medium" | "high" }

export async function tutorPrefs(): Promise<TutorPrefs> {
  return { key: (await kvGet<string>("tutor.key")) ?? null, cap: (await kvGet<number>("tutor.cap")) ?? 15, effort: (await kvGet<"medium" | "high">("tutor.effort")) ?? "medium" };
}
export const saveTutorKey = (k: string | null) => kvSet("tutor.key", k ? k.trim() : null);
export const saveTutorCap = (n: number) => kvSet("tutor.cap", n);
export const saveTutorEffort = (e: "medium" | "high") => kvSet("tutor.effort", e);

