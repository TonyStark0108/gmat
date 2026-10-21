// Questions from other official sources, logged one at a time (the OG online question banks, Official
// Practice Questions, the mba.com Starter Kit, any other site): source, type, topic, right or wrong,
// not sure, time. They join the error log and the redo ladder like any other question.

import type { Section } from "./content";
import { listTopic } from "./topics";

export const SOURCE_NAMES: Record<string, string> = {
  og_online: "OG online question bank",
  qr_online: "Quant Review online bank",
  vr_online: "Verbal Review online bank",
  dir_online: "DI Review online bank",
  opq: "Official Practice Questions",
  starter: "mba.com Starter Kit",
  other: "Another source",
};

export const QTYPES = ["PS", "DS", "GI", "TA", "TPA", "MSR", "RC", "CR"] as const;
export type QType5 = (typeof QTYPES)[number];

/** Data Insights has five question types; the app tracks each. */
export const DI_TYPE_TOPIC: Record<string, string> = {
  DS: "data sufficiency", GI: "graphics interpretation", TA: "table analysis", TPA: "two-part analysis", MSR: "multi-source reasoning",
};

export function qtypeSection(q: string): Section {
  if (q === "PS") return "quant";
  if (q === "RC") return "rc";
  if (q === "CR") return "cr";
  return "di";
}

export function logTopic(qtype: string, topic?: string | null): string {
  if (qtype === "RC") return "rc";
  if (qtype === "CR") return "cr";
  if (qtype === "DS") return topic ? `ds · ${listTopic(topic)}` : "data sufficiency";
  if (qtype !== "PS") return DI_TYPE_TOPIC[qtype] ?? "mixed";
  return topic ? listTopic(topic) : "mixed";
}
