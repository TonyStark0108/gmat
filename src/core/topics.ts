// Topics: what each question is about, in the plan's own words (spec: Adapting to you, What it tracks).
// Book questions carry the Official Guide's concept label ("Applied Problems; Percents"); the plan's
// GMAT Club lists use plain topic names ("word problems", "percents"). This maps one onto the other.

import type { Section } from "./content";

/** The plan's quant topics, in the order the plan meets them. */
export const QUANT_TOPICS = [
  "algebra", "arithmetic", "absolute values", "inequalities", "exponents", "roots", "word problems", "ratios",
  "percents", "rates", "overlapping sets", "sequences", "statistics", "multiples and factors", "remainders",
  "number properties", "probability", "combinations & permutations",
] as const;

export const DI_TYPES = ["data sufficiency", "graphs & tables", "two-part analysis", "multi-source reasoning"] as const;
export const RC_TYPES = ["main idea", "inference", "detail", "purpose", "author's attitude"] as const;
export const RC_TOPICS = ["law", "science", "social science", "humanities"] as const;

// First match wins; the book's label is checked part by part ("Applied Problems; Percents" → percents).
const CONCEPT_RULES: [RegExp, string][] = [
  [/absolute value/i, "absolute values"],
  [/inequalit|order|number line/i, "inequalities"],
  [/negative exponent|exponent/i, "exponents"],
  [/radical|root/i, "roots"],
  [/percent|profit/i, "percents"],
  [/ratio|proportion/i, "ratios"],
  [/rate|work problem/i, "rates"],
  [/venn|sets/i, "overlapping sets"],
  [/sequence|series/i, "sequences"],
  [/statistic|average/i, "statistics"],
  [/factors, multiples|divisib/i, "multiples and factors"],
  [/remainder/i, "remainders"],
  [/properties of (numbers|integers)|place value/i, "number properties"],
  [/probability/i, "probability"],
  [/combinatoric|counting/i, "combinations & permutations"],
  [/equation|algebra|factoring|function|substitution|formula/i, "algebra"],
  [/applied|measurement|estimat/i, "word problems"],
  [/operation|fraction|decimal|integer|rational|arithmetic|computation/i, "arithmetic"],
];

export function quantTopic(concept: string | null | undefined): string {
  if (!concept) return "mixed";
  const parts = concept.split(";").map((p) => p.trim());
  // the more specific label usually comes second ("Applied Problems; Percents")
  for (const part of [...parts.slice(1), parts[0]]) {
    for (const [re, topic] of CONCEPT_RULES) if (re.test(part)) return topic;
  }
  return "mixed";
}

/** The topic a book question counts toward. */
export function bookTopic(qtype: string, concept: string | null | undefined, taskSection: Section): string {
  if (qtype === "TPA") return "two-part analysis";
  if (qtype === "RC") return "rc";
  if (qtype === "CR") return "cr";
  if (qtype === "DS" && taskSection === "di") return `ds · ${quantTopic(concept)}`;
  return quantTopic(concept);
}

/** Display name: "DS · percents" stays as it is; quant topics get a capital. */
export function topicName(topic: string): string {
  if (topic === "rc") return "Reading";
  if (topic === "cr") return "Critical reasoning";
  if (topic === "mixed") return "Mixed";
  return topic.startsWith("ds · ") ? `DS · ${topic.slice(5)}` : topic[0].toUpperCase() + topic.slice(1);
}

/** The plan topic whose GMAT Club lists serve a topic ("ds · percents" uses the percents lists). */
export function listTopic(topic: string): string {
  return topic.startsWith("ds · ") ? topic.slice(5) : topic;
}

/** Topic guessed from a plan task's title, for drills and videos ("Quadratics drill" → algebra). */
export function topicFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  if (/linear|quadratic|equation|algebra/i.test(title)) return "algebra";
  for (const t of QUANT_TOPICS) if (title.toLowerCase().includes(t.replace(/s$/, ""))) return t;
  return quantTopic(title) === "mixed" ? null : quantTopic(title);
}
