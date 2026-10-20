// Flashcards (spec: Flashcards). Principles and traps in your own words, plus the two approved starter
// decks. A proven algorithm (FSRS, default parameters, no fuzz) decides when each card returns; once
// you've booked, nothing comes back after test day. New starter cards come in at about 15 a week, and
// slow down quietly if cards pile up.

import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard } from "ts-fsrs";
import { parseYmd } from "./calendar";
import type { Content, Section } from "./content";
import type { Derived } from "./state";
import { topicName } from "./topics";

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  source: "quant facts" | "method" | "error" | "video";
  topic: string | null;
  section: Section | null;
  createdTs: number;
  paused: boolean;
  due: number;           // ms
  reps: number;
  lapses: number;
  fsrs: FsrsCard;
}

export const NEW_PER_WEEK = 15;
export const SLOW_DOWN_AT = 30;       // more due than this: no new starter cards this week
export const SESSION_MIN = 10;
export const SESSION_MAX = 15;
export const CARDS_PRIORITY_AT = 10;  // the card shows cards when at least this many are due

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

/** The starter decks in order: method first (it's short), then quant facts, interleaved. */
type Starter = { id: string; front: string; back: string; deck: "quant facts" | "method"; topic: string | null };
export function starterOrder(content: Content): Starter[] {
  const q: Starter[] = content.decks.quant_facts.map((c) => ({ ...c, deck: "quant facts", topic: (c as { topic?: string }).topic ?? null }));
  const m: Starter[] = content.decks.method.map((c) => ({ ...c, deck: "method", topic: null }));
  const out: Starter[] = [];
  let qi = 0, mi = 0;
  while (qi < q.length || mi < m.length) {
    for (let k = 0; k < 4 && qi < q.length; k++) out.push(q[qi++]);
    if (mi < m.length) out.push(m[mi++]);
  }
  return out;
}

/** Which starter cards to bring in this week (stored once per week, so it never shifts). */
export function introduceThisWeek(content: Content, d: Derived, dueNow: number): string[] {
  const order = starterOrder(content).filter((c) => !d.introduced.has(c.id));
  if (dueNow > SLOW_DOWN_AT) return [];
  return order.slice(0, NEW_PER_WEEK).map((c) => c.id);
}

export function buildCards(content: Content, d: Derived): StudyCard[] {
  const starter = new Map(starterOrder(content).map((c) => [c.id, c]));
  const out: StudyCard[] = [];
  const cap = d.settings.testDate ? parseYmd(d.settings.testDate).getTime() : Infinity;
  const make = (id: string, front: string, back: string, source: StudyCard["source"], topic: string | null, section: Section | null, createdTs: number) => {
    if (d.cardDeleted.has(id)) return;
    let card = createEmptyCard(new Date(createdTs));
    let reps = 0, lapses = 0;
    for (const r of d.cardRatings.get(id) ?? []) {
      card = scheduler.next(card, new Date(r.ts), r.rating === "again" ? Rating.Again : Rating.Good).card;
      reps++;
      if (r.rating === "again") lapses++;
    }
    // once booked, nothing comes back after test day
    const due = Math.min(card.due.getTime(), cap);
    out.push({ id, front: d.cardFront.get(id) ?? front, back, source, topic, section, createdTs, paused: d.cardPaused.has(id), due, reps, lapses, fsrs: card });
  };
  for (const [id, info] of d.introduced) {
    const c = starter.get(id);
    if (c) make(id, c.front, c.back, c.deck, c.topic, c.deck === "quant facts" ? "quant" : null, info.ts);
  }
  // your own lines: "next time I'll…" from reviews, and one line after a video
  for (const l of d.lines) {
    if (!l.text.trim()) continue;
    const isVideo = l.source.startsWith("video:");
    const front = l.front ?? (isVideo ? "After the video" : "Next time");
    make(`line:${l.id}`, front, l.text, isVideo ? "video" : "error", l.topic ?? null, l.section ?? null, l.ts);
  }
  return out;
}

export function dueCards(cards: StudyCard[], nowMs: number): StudyCard[] {
  return cards.filter((c) => !c.paused && c.due <= nowMs).sort((a, b) => a.due - b.due);
}

/**
 * One session: 10–15 cards, the most overdue first, cards from weak topics a little more often.
 * If fewer than ten are due, the next ones up come early so a ride always has a session.
 */
export function sessionCards(cards: StudyCard[], nowMs: number, weight: (topic: string | null) => number = () => 1, onlyTopic?: string): StudyCard[] {
  const live = cards.filter((c) => !c.paused && (!onlyTopic || c.topic === onlyTopic || c.front.toLowerCase().includes(onlyTopic)));
  const due = live.filter((c) => c.due <= nowMs).sort((a, b) => weight(b.topic) - weight(a.topic) || a.due - b.due);
  let pick = due.slice(0, SESSION_MAX);
  if (pick.length < SESSION_MIN) {
    const soon = live.filter((c) => c.due > nowMs).sort((a, b) => a.due - b.due).slice(0, SESSION_MIN - pick.length);
    pick = [...pick, ...soon];
  }
  return pick;
}

/** The front an error card gets: "DS · number properties · process". */
export function errorFront(section: Section, topic: string, tag: string): string {
  if (topic.startsWith("ds · ")) return `DS · ${topic.slice(5)} · ${tag}`;
  const sec = section === "di" ? "DI" : section === "quant" ? "Quant" : section === "rc" ? "RC" : section === "cr" ? "CR" : "";
  const t = topic === "rc" || topic === "cr" || topic === "mixed" ? "" : ` · ${topicName(topic).toLowerCase()}`;
  return `${sec}${t} · ${tag}`;
}
