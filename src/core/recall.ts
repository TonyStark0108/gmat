// Bringing things back on purpose, so nothing you've worked on fades quietly:
//
// - New cards from each day's work: the rules-and-traps cards for every topic you worked on, the
//   traps you tagged, and a card for every concept, process or reading mistake you tagged without
//   writing a line (careless and timing slips come back as questions, and their routine is a card of
//   its own). You keep or skip each with one tap; anything left untouched is kept for you the day after
//   next. At most four are offered a day, and none while more than 30 cards are due, so they never pile
//   up: the rest wait their turn.
// - The week's recap: on Saturday, the cards made that week, mixed.
// - Your error log, from memory (once a week, and two or three days before an official mock): say your
//   own rule for each of your biggest groups of mistakes, see what you wrote, then a few of those
//   questions again. These goes are practice; they never move the redo ladder.
// - A fresh-question check a week after re-learning a topic (a top-up, or a review full of concept and
//   process mistakes): six new questions on it, to see that it's stuck.
// - The coverage list: every topic the plan teaches, whether you've started it, its cards, and where
//   it stands.

import { daysBetween, parseYmd, plusDays, weekStartOf } from "./calendar";
import { difficultyFor, listsFor, type TopicStat } from "./adapt";
import { errorFront, type StudyCard } from "./cards";
import type { Content, Section, Task } from "./content";
import type { Answer, ExtraSpec, Tag } from "./events";
import { confirmedTopics, recentGaps, standingOf, statFor, type Standing } from "./mastery";
import type { Model } from "./model";
import type { Piece } from "./pieces";
import { dueToday, fitsItem, type Item, type ReviewModel, type SetReview } from "./review";
import type { Derived } from "./state";
import { CORE_TOPICS, TOPIC_DECK, deckFor, sectionOfKey, type DeckCard } from "./topicDeck";
import { DI_TYPE_OF, bookTopic, listTopic, topicFromTitle, topicName } from "./topics";

export const NEW_PER_DAY = 4;
export const OFFER_PAUSE_AT = 30;     // more cards due than this: nothing new is offered today
export const KEEP_AFTER_DAYS = 2;     // untouched suggestions are kept for you the day after next
export const RECAP_FROM_DAY = 5;      // Saturday
export const RECAP_MIN = 5;
export const RECAP_MAX = 15;
export const RECALL_FROM_DAY = 3;     // Thursday
export const RECALL_MIN_GROUPS = 3;
export const SWEEP_DAYS_BEFORE = 3;
export const CHECK_AFTER = 7;
export const CHECK_WINDOW = 21;
export const CHECKS_PER_WEEK = 2;

const DECK_KEYS = new Set(TOPIC_DECK.map((c) => c.key));
const GT = ["graphics interpretation", "table analysis"];

// ------------------------------------------------------------------ which topics a task touches

/** The deck keys a plan task works on: its topic, its DI types, the topics of its book questions. */
export function keysOfTask(t: Task, content: Content): string[] {
  const out = new Set<string>();
  const quantish = (topic: string) => {
    if (topic.startsWith("ds · ")) { out.add("data sufficiency"); out.add(topic.slice(5)); }
    else if (topic === "graphs & tables") GT.forEach((x) => out.add(x));
    else out.add(topic);
  };
  if (t.section === "rc") out.add("rc");
  if (t.section === "cr") { out.add("cr"); if (t.topic) out.add(`cr:${t.topic}`); }
  if (t.topic && (t.section === "quant" || t.section === "di")) quantish(listTopic(t.topic));
  if (t.kind === "video" || t.kind === "drill") {
    const title = t.title ?? "";
    if (/data sufficiency|\bDS\b/i.test(title)) out.add("data sufficiency");
    if (/two-part/i.test(title)) out.add("two-part analysis");
    if (/multi-source/i.test(title)) out.add("multi-source reasoning");
    if (t.section === "di" && /graph|table/i.test(title)) GT.forEach((x) => out.add(x));
    if (t.section === "quant" || t.kind === "drill") { const q = topicFromTitle(title); if (q) out.add(q); }
  }
  if (t.kind === "og_set") {
    const book = t.pointer.book ?? "og";
    const nums = (t.pointer.list as number[] | undefined) ?? (t.pointer.numbers ? Array.from({ length: t.pointer.numbers[1] - t.pointer.numbers[0] + 1 }, (_, i) => t.pointer.numbers![0] + i) : []);
    const qs = content.book_keys.books[book]?.questions ?? [];
    // a block counts toward a topic when the topic is a real share of it (40% or more), so one stray
    // question in a mixed set doesn't count as having started that topic
    const tally = new Map<string, number>();
    for (const n of nums) {
      const q = qs.find((x) => x.n === n);
      const qtype = q?.section ?? t.pointer.qtype ?? "PS";
      if (qtype === "DS") out.add("data sufficiency");
      const topic = bookTopic(qtype, q?.concept, t.section);
      if (topic !== "mixed") tally.set(topic, (tally.get(topic) ?? 0) + 1);
    }
    for (const [topic, n] of tally) {
      if (n < Math.max(1, 0.4 * nums.length)) continue;
      if (topic === "rc" || topic === "cr") out.add(topic); else quantish(topic);
    }
  }
  if (t.kind === "di_set") {
    for (const ty of (t.pointer.types as string[] | undefined) ?? []) if (DI_TYPE_OF[ty]) out.add(DI_TYPE_OF[ty]);
    for (const r of t.pointer.recipe ?? []) for (const ty of r.types ?? []) if (DI_TYPE_OF[ty]) out.add(DI_TYPE_OF[ty]);
  }
  return [...out].filter((k) => DECK_KEYS.has(k));
}

/** The deck key a question's topic belongs to ("ds · percents" → data sufficiency). */
export function keyOfTopic(topic: string): string | null {
  if (topic.startsWith("ds · ")) return "data sufficiency";
  if (topic === "graphs & tables") return "graphics interpretation";
  return DECK_KEYS.has(topic) ? topic : null;
}

/** The first day you worked on each topic (a plan task done), and the first day you used each tag. */
export function topicsMet(content: Content, d: Derived, byId: Map<string, Piece>): Map<string, string> {
  const met = new Map<string, string>();
  const done = [...d.doneAt.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (const [pid, at] of done) {
    const p = byId.get(pid);
    if (!p) continue;
    for (const k of keysOfTask(p.task, content)) if (!met.has(k)) met.set(k, at.day);
  }
  const tags = [...d.tags.values()].sort((a, b) => a.ts - b.ts);
  for (const t of tags) { const k = `tag:${t.tag}`; if (DECK_KEYS.has(k) && !met.has(k)) met.set(k, t.day); }
  return met;
}

/** The plan week each topic first comes up in. */
export function firstWeeks(content: Content, plan: Piece[]): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const p of [...plan].sort((a, b) => a.planWeek - b.planWeek)) {
    if (seen.has(p.taskId)) continue;
    seen.add(p.taskId);
    for (const k of keysOfTask(p.task, content)) if (!out.has(k)) out.set(k, p.planWeek);
  }
  return out;
}

// ------------------------------------------------------------------ new cards from each day's work

export interface Suggestion {
  id: string;
  front: string;
  back: string;
  key: string | null;           // the deck key, for topic cards
  topic: string | null;
  section: Section | null;
  earned: string;               // the day it was earned
  day: string | null;           // the day it was offered (null: waiting its turn)
  source: "topic" | "error";
  item?: string;
  drafted?: boolean;            // Claude wrote it
}

export interface Suggestions {
  pending: Suggestion[];                          // offered, waiting for keep or skip
  kept: (Suggestion & { keptTs: number })[];
  waiting: Suggestion[];                          // earned, not offered yet (in order)
  met: Map<string, string>;
}

const show = (a: Answer | undefined) => (a === null || a === undefined ? "nothing" : Array.isArray(a) ? `column 1 row ${a[0]}, column 2 row ${a[1]}` : a);

/** A mistake you tagged without writing a line: a card that sends you back to it. */
export function errorCard(it: Item, tag: Tag, d: Derived): { front: string; back: string; drafted: boolean } {
  const draft = d.drafts.get(it.id);
  if (draft) return { ...draft, drafted: true };
  const hint = deckFor(`tag:${tag}`)[0]?.back;
  const where = it.explanation ? ` Where it's explained: ${it.explanation}.` : "";
  return {
    front: `${errorFront(it.section, it.topic, tag)} — ${it.label}. What gets it right?`,
    back: `You put ${show(it.first)}; the answer is ${show(it.key)}.${where}${hint ? ` ${hint}` : ""}`,
    drafted: false,
  };
}

export function buildSuggestions(content: Content, d: Derived, reviews: ReviewModel, byId: Map<string, Piece>, today: string): Suggestions {
  const met = topicsMet(content, d, byId);
  const raw: Omit<Suggestion, "day">[] = [];
  for (const [itemId, t] of [...d.tags.entries()].sort((a, b) => a[1].ts - b[1].ts)) {
    if (t.line?.trim()) continue;                // your own line is a card already
    if (t.tag === "careless" || t.tag === "timing") continue;
    const it = reviews.items.get(itemId);
    if (!it || it.firstMark === "unknown") continue;
    const c = errorCard(it, t.tag, d);
    raw.push({ id: `err:${itemId}`, front: c.front, back: c.back, key: null, topic: it.topic, section: it.section, earned: t.day, source: "error", item: itemId, drafted: c.drafted });
  }
  for (const [key, day] of met) {
    for (const c of deckFor(key)) {
      raw.push({ id: c.id, front: c.front, back: c.back, key, topic: key.startsWith("tag:") ? null : key, section: sectionOfKey(key), earned: day, source: "topic" });
    }
  }
  // a mistake's card first within a day; then the topic cards in the deck's order
  const order = new Map(TOPIC_DECK.map((c, i) => [c.id, i]));
  raw.sort((a, b) => (a.earned < b.earned ? -1 : a.earned > b.earned ? 1 : 0) || (a.source === b.source ? 0 : a.source === "error" ? -1 : 1) || ((order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
  const out: Suggestions = { pending: [], kept: [], waiting: [], met };
  for (const r of raw) {
    const day = d.offered.get(r.id) ?? null;
    const s: Suggestion = { ...r, day };
    const decided = d.cardKept.get(s.id);
    if (decided) { if (decided.keep) out.kept.push({ ...s, keptTs: decided.ts }); continue; }
    if (!day || day > today) { out.waiting.push(s); continue; }
    if (daysBetween(day, today) >= KEEP_AFTER_DAYS) out.kept.push({ ...s, keptTs: parseYmd(plusDays(day, KEEP_AFTER_DAYS)).getTime() });
    else out.pending.push(s);
  }
  return out;
}

/** Today's offer: the next few waiting, once a day (none while cards pile up). */
export function offerToday(s: Suggestions, d: Derived, today: string, cardsDue: number): string[] | null {
  if (d.offerDays.has(today)) return null;
  if (!s.waiting.length) return null;
  return cardsDue > OFFER_PAUSE_AT ? [] : s.waiting.filter((x) => x.earned <= today).slice(0, NEW_PER_DAY).map((x) => x.id);
}

// ------------------------------------------------------------------ the week's recap

/** The week's cards, mixed: the ones made or kept that week, topics taking turns. */
export function recapCards(cards: StudyCard[], ws: string): StudyCard[] {
  const from = parseYmd(ws).getTime(), to = parseYmd(plusDays(ws, 7)).getTime();
  const mine = cards.filter((c) => !c.paused && c.createdTs >= from && c.createdTs < to && c.source !== "quant facts" && c.source !== "method");
  const byTopic = new Map<string, StudyCard[]>();
  for (const c of mine) { const k = c.topic ?? c.source; byTopic.set(k, [...(byTopic.get(k) ?? []), c]); }
  const lanes = [...byTopic.values()];
  const out: StudyCard[] = [];
  for (let i = 0; out.length < RECAP_MAX && lanes.some((l) => l.length > i); i++) for (const l of lanes) if (l[i] && out.length < RECAP_MAX) out.push(l[i]);
  return out;
}

// ------------------------------------------------------------------ your error log, from memory

export interface RecallGroup {
  key: string;
  heading: string;
  section: Section;
  topic: string;
  tag: Tag | null;
  count: number;
  lines: string[];                // what you wrote about these
  rules: DeckCard[];              // the deck's rule for the topic and the trap
  questions: Item[];              // a few to try again (never one still waiting for its blind retry)
}

const LIVE = new Set(["redo", "return", "stubborn"]);
const SEC: Record<string, string> = { quant: "Quant", di: "DI", rc: "Reading", cr: "CR" };

export function recallGroups(reviews: ReviewModel, d: Derived, today: string, f: { online: boolean; bus: boolean }, max = 5): RecallGroup[] {
  const busy = new Set<string>();
  for (const [id, r] of d.reviewStarted) if (!d.reviewDone.has(id) && d.reviewTouched.has(id)) r.items.forEach((x) => busy.add(x));
  const groups = new Map<string, Item[]>();
  for (const it of reviews.items.values()) {
    const live = it.entered && it.firstMark !== "unknown" && (it.state === "review" || LIVE.has(it.state));
    if (!live && it.state !== "look") continue;
    const key = it.state === "look" && !it.entered ? `look|${it.section}` : `${it.section}|${it.topic}|${it.tag ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const out: RecallGroup[] = [];
  for (const [key, its] of groups) {
    const it0 = its[0];
    const look = key.startsWith("look|");
    const tag = look ? null : (it0.tag ?? null);
    const where = [SEC[it0.section] ?? it0.section, it0.topic === "rc" || it0.topic === "cr" || look ? null : topicName(it0.topic).toLowerCase()].filter(Boolean).join(" · ");
    const heading = look ? `Worth another look · ${SEC[it0.section] ?? it0.section}` : `${tag ? tag[0].toUpperCase() + tag.slice(1) : "Not sure"} · ${where}`;
    const lines = [...new Set(its.map((x) => x.line).filter(Boolean) as string[])].slice(0, 3);
    const tk = keyOfTopic(it0.topic);
    const rules = [...(tk ? deckFor(tk).slice(0, look ? 1 : 2) : []), ...(tag ? deckFor(`tag:${tag}`).slice(0, 1) : [])];
    // the ones to try again: not due today (those are in today's review), never one before its blind retry
    const rank = (x: Item) => (x.state === "return" ? 0 : x.state === "look" ? 1 : x.state === "stubborn" ? 2 : 3);
    const questions = its.filter((x) => x.state !== "review" && !busy.has(x.id) && !dueToday(x, d, today) && fitsItem(x, { bus: f.bus, online: f.online, morning: false }))
      .sort((a, b) => rank(a) - rank(b)).slice(0, 2);
    out.push({ key, heading, section: it0.section, topic: it0.topic, tag, count: its.length, lines, rules, questions });
  }
  out.sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
  return out.slice(0, max);
}

// ------------------------------------------------------------------ the extras this adds

const isOfficialMock = (p: Piece) => p.task.kind === "mock" && p.task.pointer.type === "official_mock";

/** The recall task, the pre-mock sweep, the week's recap and fresh-question checks, as they come due. */
export function recallSpecs(m: Model): ExtraSpec[] {
  const { d, today, weekStart: ws, reviews } = m;
  if (!d.weeks.has(ws) || m.week?.pause || m.phase === "taper" || m.phase === "testweek") return [];
  const out: ExtraSpec[] = [];
  const groups = recallGroups(reviews, d, today, { online: true, bus: false }, 8);
  const busOnly = (gs: RecallGroup[]) => gs.every((g) => g.section === "rc" || g.section === "cr");

  // your error log, from memory: once a week, from Thursday
  if (today >= plusDays(ws, RECALL_FROM_DAY) && groups.length >= RECALL_MIN_GROUPS) {
    const top = groups.slice(0, 5);
    out.push({ id: `recall:${ws}`, kind: "recall", week: ws, section: "general", topic: null, title: "Your error log, from memory", minutes: 20,
      open: { type: "recall", bus: busOnly(top) }, reason: "Your own rule for each of your biggest groups of mistakes, then a few of those questions again." });
  }
  // two or three days before an official mock: every group
  for (const c of m.week?.chips ?? []) {
    const p = m.byId.get(c.pieceId);
    if (!p || !isOfficialMock(p) || d.done.has(p.id)) continue;
    const day = d.mockMoved.get(p.id) ?? m.week?.mockDay;
    if (!day || today > day || daysBetween(today, day) > SWEEP_DAYS_BEFORE || !groups.length) continue;
    out.push({ id: `sweep:${p.id}`, kind: "recall", week: ws, section: "general", topic: null, title: "Before the mock: your error log, from memory", minutes: 30,
      open: { type: "recall", sweep: p.id, bus: busOnly(groups) }, reason: "Every open group of mistakes: your rule, your notes, a question or two each." });
  }
  // the week's recap, from Saturday
  if (today >= plusDays(ws, RECAP_FROM_DAY)) {
    const n = recapCards(m.cards, ws).length;
    if (n >= RECAP_MIN) out.push({ id: `recap:${ws}`, kind: "recap", week: ws, section: "general", topic: null, title: `This week's recap · ${n} cards`, minutes: 10,
      open: { type: "recap", week: ws }, reason: "The cards you made this week, mixed." });
  }
  out.push(...checkSpecs(m));
  return out;
}

/** A week after re-learning a topic: six new questions on it, to see that it's stuck. */
export function checkSpecs(m: Model): ExtraSpec[] {
  const { d, today, weekStart: ws, reviews, content } = m;
  const confirmed = confirmedTopics(m.adapt.stats, reviews, today);
  const thisWeek = [...d.extras.values()].filter((x) => x.kind === "check" && x.week === ws).length;
  const cands: { id: string; topic: string; section: Section; from: string; reason: string }[] = [];
  for (const x of d.extras.values()) {
    if (x.kind !== "topup" || !x.topic) continue;
    const done = d.doneAt.get(`x:${x.id}#0`);
    if (done) cands.push({ id: `check:${x.id}`, topic: x.topic, section: x.section, from: done.day, reason: "A week on from the top-up: six new ones on it, to see that it's stuck." });
  }
  for (const s of reviews.sets) {
    const done = d.reviewDone.get(s.id);
    if (!done || (s.section !== "quant" && s.section !== "di")) continue;
    const byTopic = new Map<string, number>();
    for (const it of s.items) if ((it.tag === "concept" || it.tag === "process") && it.topic !== "mixed") byTopic.set(it.topic, (byTopic.get(it.topic) ?? 0) + 1);
    for (const [topic, n] of byTopic) {
      if (n < 2) continue;
      // a top-up on it since then gets its own check
      if ([...d.extras.values()].some((x) => x.kind === "topup" && x.topic === topic && x.addedDay >= done.day)) continue;
      cands.push({ id: `check:${topic}:${s.id}`, topic, section: s.section, from: done.day, reason: `A week on from those ${topicName(topic).toLowerCase()} mistakes: six new ones, to see that it's stuck.` });
    }
  }
  const out: ExtraSpec[] = [];
  for (const c of cands.sort((a, b) => (a.from < b.from ? -1 : 1))) {
    if (thisWeek + out.length >= CHECKS_PER_WEEK) break;
    if (d.extras.has(c.id) || confirmed.has(c.topic)) continue;
    const age = daysBetween(c.from, today);
    if (age < CHECK_AFTER || age > CHECK_WINDOW) continue;
    if (out.some((x) => x.topic === c.topic) || [...d.extras.values()].some((x) => x.kind === "check" && x.topic === c.topic && daysBetween(x.addedDay, today) < CHECK_AFTER)) continue;
    const urls = listsFor(content, c.topic, difficultyFor(m.adapt.stats.get(c.topic))).slice(0, 2);
    if (!urls.length) continue;
    out.push({ id: c.id, kind: "check", week: ws, section: c.section, topic: c.topic, title: `Check · ${topicName(c.topic).toLowerCase()} · 6 new questions`, minutes: 15,
      open: { type: "list", urls, count: 6 }, reason: c.reason });
  }
  return out;
}

// ------------------------------------------------------------------ after a review: the next step for each kind of mistake

export interface Remedies { add: ExtraSpec[]; lines: string[]; teach: string | null; walk: string | null }

/**
 * Concept: re-teach (the topic's video and easier questions come as a top-up offer), and a session with
 * the tutor. Process: a worked example with the tutor. Timing: six with no clock, then six timed.
 * Careless: the checking routine (as a card) and the plan's careless-errors video. Reading and CR traps:
 * the card for that trap. A fresh-question check follows a week later.
 */
export function closeRemedies(s: SetReview, m: Model): Remedies {
  const { d, today, content } = m;
  const ws = weekStartOf(today);
  const tagged = s.items.filter((it) => it.tag);
  const count = (tag: Tag) => { const by = new Map<string, number>(); for (const it of tagged) if (it.tag === tag) by.set(it.topic, (by.get(it.topic) ?? 0) + 1); return [...by.entries()].sort((a, b) => b[1] - a[1])[0] ?? null; };
  const out: Remedies = { add: [], lines: [], teach: null, walk: null };
  const timing = (s.section === "quant" || s.section === "di") ? count("timing") : null;
  if (timing && timing[0] !== "mixed" && ![...d.extras.values()].some((x) => x.kind === "timing" && x.week === ws)) {
    const urls = listsFor(content, timing[0], "medium").slice(0, 2);
    if (urls.length) {
      out.add.push({ id: `timing:${timing[0]}:${ws}`, kind: "timing", week: ws, section: s.section, topic: timing[0], title: `Timing · ${topicName(timing[0]).toLowerCase()} · 6 with no clock, then 6 timed`,
        minutes: 30, open: { type: "list", urls, count: 12 }, reason: "Six with no clock to get the method right, then six at about two minutes each." });
      out.lines.push(`Timing came up: six ${topicName(timing[0]).toLowerCase()} questions with no clock, then six timed, added to this week.`);
    }
  }
  const concept = count("concept"), process = count("process");
  if (concept && concept[0] !== "mixed") out.teach = concept[0];
  if (process && process[0] !== "mixed" && process[0] !== concept?.[0]) out.walk = process[0];
  // a trap tagged for the first time today: its card is in today's new cards
  const fresh = [...new Set(tagged.map((it) => it.tag!))].filter((t) => deckFor(`tag:${t}`).length && !deckFor(`tag:${t}`).every((c) => d.cardKept.has(c.id)) && m.sugg.met.get(`tag:${t}`) === today);
  if (fresh.length) out.lines.push(`A card for ${fresh.map((t) => `"${t}"`).join(", ")} is in today's new cards.`);
  return out;
}

// ------------------------------------------------------------------ the coverage list

export interface CoverageRow {
  topic: string;
  name: string;
  section: Section;
  firstWeek: number | null;
  met: string | null;             // the day you first worked on it
  cards: number;                  // cards for it in the deck
  kept: number;                   // of those, in your cards now
  standing: Standing;
  inReview: number;
}

export interface Coverage {
  rows: CoverageRow[];
  started: number;
  total: number;
  missingCards: string[];         // topics with no cards: there should never be any
  comingBack: number;
  look: number;
  confirmed: number;
}

export function coverage(m: Model): Coverage {
  const weeks = firstWeeks(m.content, m.plan);
  const met = m.sugg.met;
  const kept = new Set(m.sugg.kept.map((s) => s.id));
  const rows: CoverageRow[] = CORE_TOPICS.map((topic) => {
    const keys = topic === "cr" ? [...DECK_KEYS].filter((k) => k === "cr" || k.startsWith("cr:")) : [topic];
    const cards = keys.flatMap((k) => deckFor(k));
    const metDay = met.get(topic) ?? null;
    const stat: TopicStat | undefined = statFor(m.adapt.stats, topic);
    const inReview = [...m.reviews.items.values()].filter((it) => keyOfTopic(it.topic) === topic && it.entered && LIVE.has(it.state)).length;
    return {
      topic, name: topic === "rc" ? "Reading" : topic === "cr" ? "Critical reasoning" : topicName(topic), section: sectionOfKey(topic),
      firstWeek: weeks.get(topic) ?? null, met: metDay, cards: cards.length, kept: cards.filter((c) => kept.has(c.id)).length,
      standing: standingOf(stat, !!metDay, recentGaps(m.reviews, topic, m.today)), inReview,
    };
  });
  return {
    rows, started: rows.filter((r) => r.met || r.standing !== "later").length, total: rows.length,
    missingCards: rows.filter((r) => !r.cards).map((r) => r.topic),
    comingBack: m.reviews.inReview + m.reviews.stubborn, look: m.reviews.look, confirmed: rows.filter((r) => r.standing === "confirmed").length,
  };
}
