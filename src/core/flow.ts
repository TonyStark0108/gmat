// The flow zone: work pitched at what you can do, a little harder, never far off either way.
//
// Each topic sits in one of three zones, from your own evidence (your last two sets on it of five or
// more questions, and how the last set felt, one tap after each set):
//   stretch: harder than your skill right now (under 60% lately, or it felt too hard and under 75%).
//            Easier questions first, no clock, the topic's chapter or video first.
//   flow:    matched, a little hard. The usual mix, gently timed once you're at 80%.
//   easy:    below your skill (90% or more lately, or it felt too easy at 80% or more). Harder
//            questions and a real pace, so it doesn't turn into boredom.
// Until a topic has ten questions behind it, it's "new": untimed, the plan's own order.
// The zone picks which GMAT Club list a set opens with, whether the clock is on, and the difficulty
// of extra practice. It's recomputed every time, from evidence, and shown in words, never as a score.

import type { TopicStat } from "./adapt";
import { plusDays } from "./calendar";
import type { Piece } from "./pieces";
import type { ReviewModel } from "./review";
import type { Derived } from "./state";
import { DI_TYPE_OF, bookTopic, listTopic } from "./topics";
import type { Content } from "./content";

export type Zone = "new" | "stretch" | "flow" | "easy";
export type Pace = "untimed" | "soft" | "paced";
export type Feel = "easy" | "right" | "hard";

export const NEW_UNTIL = 10;
export const STRETCH_BELOW = 0.6;
export const EASY_FROM = 0.9;
export const PACED_FROM = 0.8;
const FEEL_DAYS = 21;

/** The topics a piece's questions count toward (the keys the topic stats use). */
export function topicsOfPiece(p: Piece, reviews: ReviewModel, content?: Content): string[] {
  const t = p.task;
  if (t.section === "rc") return ["rc"];
  if (t.section === "cr") return ["cr"];
  if (t.kind === "og_set") {
    const its = [...reviews.items.values()].filter((it) => it.pieceId === p.id && it.topic !== "mixed");
    const n = new Map<string, number>();
    for (const it of its) n.set(it.topic, (n.get(it.topic) ?? 0) + 1);
    if (!its.length && content) {
      // not answered yet: the book's concept labels for the questions in this piece
      const book = t.pointer.book ?? "og";
      const nums = (t.pointer.list as number[] | undefined) ?? (p.numbers ? Array.from({ length: p.numbers[1] - p.numbers[0] + 1 }, (_, i) => p.numbers![0] + i) : []);
      for (const q of content.book_keys.books[book]?.questions ?? []) {
        if (!nums.includes(q.n)) continue;
        const topic = bookTopic(q.section ?? t.pointer.qtype ?? "PS", q.concept, t.section);
        if (topic !== "mixed") n.set(topic, (n.get(topic) ?? 0) + 1);
      }
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }
  if (t.kind === "di_set") return ((t.pointer.types as string[] | undefined) ?? []).map((x) => DI_TYPE_OF[x] ?? x);
  if (t.topic) return [listTopic(t.topic)];
  return [];
}

/** Recent first-try accuracy: the last two sets of five or more, or the weighted figure without them. */
export function recentAccuracy(stat: TopicStat): number {
  const sets = stat.sets.filter((s) => s.n >= 5).slice(-2);
  return sets.length ? sets.reduce((a, s) => a + s.accuracy * s.n, 0) / sets.reduce((a, s) => a + s.n, 0) : stat.accuracy;
}

export function zoneOf(stat: TopicStat | undefined, lastFeel: Feel | null): Zone {
  if (!stat || stat.attempts < NEW_UNTIL) return lastFeel === "hard" ? "stretch" : "new";
  const acc = recentAccuracy(stat);
  if (acc < STRETCH_BELOW || (lastFeel === "hard" && acc < 0.75)) return "stretch";
  if (acc >= EASY_FROM || (lastFeel === "easy" && acc >= PACED_FROM)) return "easy";
  return "flow";
}

export function paceOf(zone: Zone, stat: TopicStat | undefined): Pace {
  if (zone === "new" || zone === "stretch") return "untimed";
  if (zone === "easy") return "paced";
  return stat && recentAccuracy(stat) >= PACED_FROM ? "paced" : "soft";
}

/** The last feel tapped for a topic, in the last three weeks. */
export function lastFeelFor(topic: string, d: Derived, byId: Map<string, Piece>, reviews: ReviewModel, today: string): Feel | null {
  for (let i = d.feels.length - 1; i >= 0; i--) {
    const f = d.feels[i];
    if (f.day < plusDays(today, -FEEL_DAYS)) break;
    const p = byId.get(f.piece);
    if (p && topicsOfPiece(p, reviews).includes(topic)) return f.feel;
  }
  return null;
}

/** Which of a set's lists to open first, by zone. */
export function listOrder(zone: Zone, planWeek: number): string[] {
  if (zone === "stretch") return ["easy", "mixed", "medium"];
  if (zone === "easy") return ["medium", "mixed", "easy"];
  return planWeek <= 2 ? ["easy", "mixed", "medium"] : ["medium", "mixed", "easy"];
}

/** One line for the top of a set, in words. */
export function paceLine(pace: Pace, section: string): string {
  const per = section === "di" ? "2½" : "2";
  if (pace === "untimed") return "Untimed: take the time to set each one up cleanly.";
  if (pace === "soft") return `Soft-timed: aim for about ${section === "di" ? "3" : "2½"} minutes a question, no rush.`;
  return `Normal pace: about ${per} minutes a question. If one won't open up within a minute, make your best guess and move on.`;
}

export function zoneLine(zone: Zone, name: string): string | null {
  if (zone === "stretch") return `${name} is a stretch right now, so this starts with the easier list and no clock.`;
  if (zone === "easy") return `${name} is going well, so this starts with the harder list.`;
  return null;
}

/** What the app says back when you tap how a set felt. */
export function feelReply(feel: Feel, name: string | null): string {
  const t = name ?? "this";
  if (feel === "hard") return `Noted. Next time ${t} starts easier, with no clock.`;
  if (feel === "easy") return `Noted. ${name ? name[0].toUpperCase() + name.slice(1) : "This"} steps up: harder questions next time.`;
  return "Good. That's the zone.";
}

/** Two sets in a row that felt too hard, in one sitting: suggest a breather. */
export function hardStreak(d: Derived, today: string): boolean {
  const todays = d.feels.filter((f) => f.day === today);
  return todays.length >= 2 && todays.slice(-2).every((f) => f.feel === "hard");
}
