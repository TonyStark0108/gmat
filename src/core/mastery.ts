// Where each topic stands, from evidence only. Finishing a lesson isn't knowing a topic: a topic is
// "confirmed" once two separate sets of five or more, a week or more apart, both came in at 80% or
// better on the first try, with 15 questions or more in all, the latest set holding up, and no concept
// or process mistakes on it in the last two weeks. Recomputed every time, never stored, never a score.
// Confirmed topics stop drawing the week's extra practice and fresh-question checks.

import { daysBetween, plusDays } from "./calendar";
import type { TopicStat } from "./adapt";
import type { ReviewModel } from "./review";
import { DI_TYPES } from "./topics";

export type Standing = "later" | "started" | "building" | "consistent" | "confirmed";

/** Words for the coverage list: what's happened, never a judgement. */
export const STANDING_WORDS: Record<Standing, string> = {
  later: "Comes up later", started: "Started", building: "Building", consistent: "Consistent", confirmed: "Confirmed",
};

export const CONFIRM_MIN = 15;
export const GOOD_SET = 0.8;
export const SET_MIN = 5;
export const CONFIRM_GAP = 7;
const RECENT_GAP_DAYS = 14;

/** Several stats as one (data sufficiency across its topics; graphs & tables in both of its DI types). */
export function mergeStats(xs: (TopicStat | undefined)[]): TopicStat | undefined {
  const s = xs.filter(Boolean) as TopicStat[];
  if (!s.length) return undefined;
  if (s.length === 1) return s[0];
  const attempts = s.reduce((a, x) => a + x.attempts, 0);
  return {
    ...s[0], attempts, accuracy: s.reduce((a, x) => a + x.accuracy * x.attempts, 0) / Math.max(1, attempts),
    inReview: s.reduce((a, x) => a + x.inReview, 0), reviewWeight: s.reduce((a, x) => a + x.reviewWeight, 0),
    sets: s.flatMap((x) => x.sets).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    tags: s.reduce((t, x) => { for (const [k, n] of Object.entries(x.tags)) t[k as keyof typeof t] = (t[k as keyof typeof t] ?? 0) + (n ?? 0); return t; }, {} as TopicStat["tags"]),
  };
}

/** The stats that count toward a topic on the coverage list. */
export function statFor(stats: Map<string, TopicStat>, topic: string): TopicStat | undefined {
  if (topic === "data sufficiency") return mergeStats([...stats.values()].filter((s) => s.topic === "data sufficiency" || s.topic.startsWith("ds · ")));
  if (topic === "graphics interpretation" || topic === "table analysis") return mergeStats([stats.get(topic), stats.get("graphs & tables")]);
  return stats.get(topic);
}

/** Concept or process mistakes on a topic in the last two weeks. */
export function recentGaps(reviews: ReviewModel, topic: string, today: string): number {
  const from = plusDays(today, -RECENT_GAP_DAYS);
  const match = (t: string) => t === topic || (topic === "data sufficiency" && t.startsWith("ds · ")) || ((topic === "graphics interpretation" || topic === "table analysis") && t === "graphs & tables");
  return [...reviews.items.values()].filter((it) => match(it.topic) && (it.tag === "concept" || it.tag === "process") && it.setDay >= from).length;
}

export function standingOf(stat: TopicStat | undefined, met: boolean, gaps: number): Standing {
  if (!stat || stat.attempts === 0) return met ? "started" : "later";
  if (stat.attempts < SET_MIN) return met ? "started" : "later";     // a stray question or two before the plan gets there
  const good = stat.sets.filter((s) => s.n >= SET_MIN && s.accuracy >= GOOD_SET);
  const scored = stat.sets.filter((s) => s.n >= SET_MIN);
  const latest = scored[scored.length - 1];
  const spread = good.length >= 2 && daysBetween(good[0].day, good[good.length - 1].day) >= CONFIRM_GAP;
  if (stat.attempts >= CONFIRM_MIN && spread && latest && latest.accuracy >= GOOD_SET && gaps === 0) return "confirmed";
  if (good.length) return "consistent";
  return "building";
}

/** Topics confirmed right now, by their stats key (so extra practice can leave them be). */
export function confirmedTopics(stats: Map<string, TopicStat>, reviews: ReviewModel, today: string): Set<string> {
  const out = new Set<string>();
  for (const [key, st] of stats) if (standingOf(st, true, recentGaps(reviews, key, today)) === "confirmed") out.add(key);
  return out;
}

export const isDiType = (t: string) => (DI_TYPES as readonly string[]).includes(t);
