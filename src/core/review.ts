// Log now, review later; the life of a wrong answer (spec: After a set; The life of a wrong answer).
//
// A set is logged on submit. Its review opens 1–3 days later: a blind retry of the wrong and not-sure
// ones, right-or-wrong dots, a last try, the answers, then tags. Each question then follows the redo
// ladder: Redo → Return (14–21 days later) → Retired (right twice, a week or more apart), or Moved on
// after three misses. Everything here is computed from the event log; nothing is stored twice.

import { dayCapacity, daysBetween, plusDays, weekStartOf } from "./calendar";
import type { Settings } from "./settings";
import { pagesFor, type BookId, type Content, type Section, type Task } from "./content";
import type { Answer, Tag } from "./events";
import { markOne } from "./grid";
import { groupOf, type Group, type Piece } from "./pieces";
import type { Derived } from "./state";
import { bookTopic } from "./topics";

export type ItemState = "fine" | "review" | "redo" | "return" | "retired" | "movedon" | "done";
export type ItemSource = "book" | "rc" | "cr" | "share";

export interface Item {
  id: string;
  review: string;                 // the set review it started in ("set:<task>"), or "share"
  taskId: string;
  pieceId: string;
  source: ItemSource;
  section: Section;
  group: Group;
  topic: string;
  rcType?: string;
  rcTopic?: string;
  passageId?: string;
  q: string;                      // question number, or RC question id
  n?: number;
  book?: BookId;
  url?: string;
  label: string;                  // where to find it again
  explanation: string | null;     // where the explanation is
  first: Answer;
  firstUnsure: boolean;
  firstMs: number | null;         // time on the question, when it can be told
  setDay: string;
  key: Answer | undefined;        // undefined: not known yet (CR, or marking against your own book)
  firstMark: "right" | "wrong" | "unknown";
  entered: boolean;               // wrong or not sure on the first try
  state: ItemState;
  misses: number;
  dueFrom: string | null;
  rightRedoDay: string | null;
  lastDay: string | null;
  retiredDay: string | null;
  movedOnDay: string | null;
  needsTag: boolean;              // wrong on the first try: the review asks why
  tag?: Tag;
  line?: string;
  attempts: number;               // goes in reviews, not counting the last try
}

export type SetStatus = "none" | "waiting" | "open" | "started" | "done" | "lapsed";

export interface SetReview {
  id: string;                     // "set:<taskId>"
  taskId: string;
  task: Task;
  section: Section;
  group: Group;
  setDay: string;
  windowFrom: string;
  path: "full" | "fallback";
  items: Item[];                  // the ones to look at again
  all: Item[];                    // every question in the set
  status: SetStatus;
  minutes: number;
  bus: boolean;                   // reading and CR reviews happen on the ride
  online: boolean;                // CR needs GMAT Club to check the answers
}

export interface ReviewModel {
  sets: SetReview[];
  setById: Map<string, SetReview>;
  items: Map<string, Item>;
  retired: number;
  inReview: number;
  movedOn: number;
  errorsSoFar: number;
  openMixed: { id: string; items: Item[] } | null;
}

export const REDO_MIN_GAP = 1;
export const RETURN_AFTER = 14;
export const RETIRE_GAP = 7;
export const LAPSE_AFTER = 14;
export const MOVE_ON_AT = 3;
export const MIXED_SIZE = 8;

const SET_KINDS = new Set(["og_set", "rc_section", "cr_set", "di_set"]);

export interface ReviewInput {
  content: Content;
  pieces: Piece[];                 // plan pieces and extras (passage redos are extras)
  d: Derived;
  today: string;
  bookEditionMatches: boolean;
}

/** Marking against your own book's key: the spot check failed, or the editions differ. */
export function selfMarked(d: Derived, book: BookId, qtype: string, editionMatches: boolean): boolean {
  if (book !== "og") return false;
  if (!editionMatches) return true;
  const scope = `${book}:${qtype}`;
  const spots = d.bookChecks.filter((c) => c.scope === scope && c.what === "spot");
  const last = spots[spots.length - 1];
  return !!last && !last.ok;
}

export function pageOffset(d: Derived, scope: string, content: Content): number {
  const pages = d.bookChecks.filter((c) => c.scope === scope && c.what === "page" && c.n && c.page);
  const last = pages[pages.length - 1];
  if (!last) return 0;
  const [book] = scope.split(":");
  const q = content.book_keys.books[book as BookId]?.questions.find((x) => x.n === last.n);
  return q?.page ? last.page! - q.page : 0;
}

function keyFor(inp: ReviewInput, book: BookId, n: number, qtype: string): Answer | undefined {
  const { d, content } = inp;
  const o = d.keyOverrides.get(`${book}:${n}`);
  if (o !== undefined) return o;
  const typed = d.keysEntered.get(`book:${book}:${n}`);
  if (typed !== undefined) return typed;
  if (selfMarked(d, book, qtype, inp.bookEditionMatches)) return undefined;
  const q = content.book_keys.books[book]?.questions.find((x) => x.n === n);
  return q?.answer ?? undefined;
}

const markOf = (value: Answer, key: Answer | undefined): Item["firstMark"] => {
  if (key === undefined || key === null) return value === null ? "wrong" : "unknown";
  const m = markOne(value, key as string | number[]);
  return m === "right" ? "right" : m === "unknown" ? "unknown" : "wrong";
};

function blank(base: Omit<Item, "key" | "firstMark" | "entered" | "state" | "misses" | "dueFrom" | "rightRedoDay" | "lastDay" | "retiredDay" | "movedOnDay" | "needsTag" | "attempts">, key: Answer | undefined): Item {
  const firstMark = markOf(base.first, key);
  const entered = firstMark !== "right" || base.firstUnsure;
  return { ...base, key, firstMark, entered, state: entered ? "review" : "fine", misses: firstMark === "wrong" ? 1 : 0, dueFrom: null,
    rightRedoDay: null, lastDay: null, retiredDay: null, movedOnDay: null, needsTag: firstMark === "wrong", attempts: 0 };
}

/** Every question of a logged set, with its first answer and key. */
function setItems(inp: ReviewInput, task: Task, ps: Piece[], setDay: string): Item[] {
  const { d, content } = inp;
  const out: Item[] = [];
  const review = `set:${task.id}`;
  const ans = (p: Piece, q: string) => d.answers.get(p.id)?.get(q);
  if (task.kind === "og_set" || (task.kind === "di_set" && task.pointer.recipe?.some((r) => r.numbers))) {
    const book: BookId = task.kind === "og_set" ? (task.pointer.book ?? "og")
      : (task.pointer.recipe!.find((r) => r.numbers)!.source.startsWith("DI Review") ? "dir" : "og");
    const qs = content.book_keys.books[book]?.questions ?? [];
    for (const p of ps) {
      const range = task.kind === "og_set" ? p.numbers : task.pointer.recipe!.find((r) => r.numbers)!.numbers;
      if (!range) continue;
      for (let n = range[0]; n <= range[1]; n++) {
        const bq = qs.find((x) => x.n === n);
        const qtype = bq?.section ?? task.pointer.qtype ?? "PS";
        const a = ans(p, String(n));
        const scope = `${book}:${qtype}`;
        const pg = book === "og" ? pagesFor(content, book, n, n) : null;
        const off = book === "og" ? pageOffset(d, scope, content) : 0;
        const label = book === "og"
          ? `Book${pg ? `, page ${pg[0] + off}` : ""}, question ${n}`
          : `${book === "qr" ? "Quant Review" : book === "vr" ? "Verbal Review" : "DI Review"} (on screen), question ${n}`;
        const section: Section = qtype === "RC" ? "rc" : qtype === "CR" ? "cr" : task.section;
        out.push(blank({
          id: `${task.id}|${n}`, review, taskId: task.id, pieceId: p.id, source: "book", section, group: groupOf(section),
          topic: bookTopic(qtype, bq?.concept, task.section), q: String(n), n, book, label,
          explanation: book === "og" ? "the explanation is in your book, after the questions" : "the explanation is in the book, after the questions",
          first: a?.value ?? null, firstUnsure: !!a?.unsure, firstMs: null, setDay,
        }, keyFor(inp, book, n, qtype)));
      }
    }
  } else if (task.kind === "rc_section") {
    const sec = content.rc_bank.sections.find((s) => s.id === task.pointer.section);
    const only = task.pointer.passages as number[] | undefined;
    const p = ps[0];
    sec?.passages.forEach((pa, pi) => {
      if (only && !only.includes(pi)) return;
      pa.questions.forEach((q, qi) => {
        const a = ans(p, q.id);
        const flag = d.rcFlags.get(p.id)?.get(q.id);
        out.push(blank({
          id: `${task.id}|${q.id}`, review, taskId: task.id, pieceId: p.id, source: "rc", section: "rc", group: "V", topic: "rc",
          rcType: q.type, rcTopic: pa.topic, passageId: pa.id, q: q.id,
          label: `${sec.source}, passage ${pi + 1}, question ${qi + 1}`, explanation: null,
          first: a?.value ?? null, firstUnsure: !!flag, firstMs: null, setDay,
        }, q.answer));
      });
    });
  } else if (task.kind === "cr_set") {
    const set = [...content.cr_bank.default_sets, ...content.cr_bank.reserve_sets].find((s) => s.id === task.pointer.set);
    const p = ps[0];
    for (const q of set?.questions ?? []) {
      const swap = d.crSwaps.filter((s) => s.set === set!.id && s.n === q.n).pop();
      const url = swap?.url ?? q.url;
      const a = ans(p, String(q.n));
      out.push(blank({
        id: `${task.id}|${q.n}`, review, taskId: task.id, pieceId: p.id, source: "cr", section: "cr", group: "V", topic: "cr",
        q: String(q.n), n: q.n, url, label: `CR question ${q.n} (GMAT Club)`, explanation: "the GMAT Club thread has the explanations",
        first: a?.value ?? null, firstUnsure: !!a?.unsure, firstMs: null, setDay,
      }, d.keysEntered.get(`cr:${url}`)));
    }
  }
  // time per question, from the gaps between entries (book sets entered as you go)
  const byPiece = new Map<string, Item[]>();
  for (const it of out) byPiece.set(it.pieceId, [...(byPiece.get(it.pieceId) ?? []), it]);
  for (const [pid, its] of byPiece) {
    const recs = its.map((it) => ({ it, r: d.answers.get(pid)?.get(it.q) })).filter((x) => x.r && !x.r.fixed).sort((a, b) => a.r!.sinceStartMs - b.r!.sinceStartMs);
    let prev = 0;
    for (const { it, r } of recs) {
      it.firstMs = r!.sinceStartMs - prev;
      prev = r!.sinceStartMs;
    }
  }
  return out;
}

/** Walk an item's attempts through the redo ladder. */
function ladder(it: Item, d: Derived, setReview: { status: SetStatus; doneDay: string | null; windowFrom: string } | null) {
  if (!it.entered) return;
  const tag = d.tags.get(it.id);
  if (tag) { it.tag = tag.tag; it.line = tag.line; }
  if (setReview) it.dueFrom = setReview.windowFrom;
  if (it.source === "rc") {
    // single reading questions are never redone: the review is the end of them
    if (setReview?.status === "done") it.state = "done";
    return;
  }
  const atts = (d.attempts.get(it.id) ?? []).filter((a) => a.attempt !== "last");
  for (const a of atts) {
    const right = a.right ?? (it.key !== undefined && markOne(a.value, it.key as string | number[]) === "right");
    it.attempts++;
    it.lastDay = a.day;
    if (it.state === "review" || it.state === "redo") {
      if (right) { it.state = "return"; it.rightRedoDay = a.day; it.dueFrom = plusDays(a.day, RETURN_AFTER); }
      else { it.misses++; it.state = it.misses >= MOVE_ON_AT ? "movedon" : "redo"; it.dueFrom = plusDays(a.day, REDO_MIN_GAP); }
    } else if (it.state === "return") {
      if (right && it.rightRedoDay && daysBetween(it.rightRedoDay, a.day) >= RETIRE_GAP) { it.state = "retired"; it.retiredDay = a.day; }
      else if (!right) { it.misses++; it.state = it.misses >= MOVE_ON_AT ? "movedon" : "redo"; it.dueFrom = plusDays(a.day, REDO_MIN_GAP); }
    }
    if (it.state === "movedon") { it.movedOnDay = a.day; break; }
    if (it.state === "retired") break;
  }
  if (it.state === "review" && setReview) {
    // the review finished without a blind retry for this one (the no-key path), or never happened
    if (setReview.status === "done") { it.state = "redo"; it.dueFrom = plusDays(setReview.doneDay!, REDO_MIN_GAP); }
    else if (setReview.status === "lapsed") { it.state = "redo"; it.dueFrom = plusDays(setReview.windowFrom, LAPSE_AFTER); }
  }
}

function setStatus(id: string, hasItems: boolean, windowFrom: string, d: Derived, today: string): SetStatus {
  if (d.reviewDone.has(id)) return "done";
  if (d.reviewStarted.has(id)) return "started";
  if (!hasItems) return "none";
  if (today < windowFrom) return "waiting";
  if (daysBetween(windowFrom, today) >= LAPSE_AFTER) return "lapsed";
  return "open";
}

/** A review opens the day after the set; after a session past 11:30 pm, a day later. */
export function windowAfter(day: string, d: Derived): string {
  const next = plusDays(day, REDO_MIN_GAP);
  return d.lateSessions.has(day) ? plusDays(next, 1) : next;
}

export function buildReviews(inp: ReviewInput): ReviewModel {
  const { d, pieces, today } = inp;
  const byTask = new Map<string, Piece[]>();
  for (const p of pieces) byTask.set(p.taskId, [...(byTask.get(p.taskId) ?? []), p]);
  const sets: SetReview[] = [];
  const items = new Map<string, Item>();

  for (const [taskId, ps] of byTask) {
    const task = ps[0].task;
    if (!SET_KINDS.has(task.kind)) continue;
    if (task.kind === "di_set" && !task.pointer.recipe?.some((r) => r.numbers)) continue;
    if (!ps.every((p) => d.submitted.has(p.id))) continue;
    const setDay = ps.map((p) => d.submitted.get(p.id)!.day).sort().pop()!;
    const all = setItems(inp, task, ps, setDay);
    const path: SetReview["path"] = all.some((it) => it.key === undefined && it.source !== "share") ? "fallback" : "full";
    const look = path === "fallback" ? all.filter((it) => it.entered || it.firstUnsure || it.firstMark === "unknown") : all.filter((it) => it.entered);
    const id = `set:${taskId}`;
    const windowFrom = windowAfter(setDay, d);
    const status = setStatus(id, look.length > 0 || path === "fallback", windowFrom, d, today);
    const doneDay = d.reviewDone.get(id)?.day ?? null;
    for (const it of all) {
      ladder(it, d, { status, doneDay, windowFrom });
      items.set(it.id, it);
    }
    const reviewMinutes = ps.reduce((s, p) => s + p.review, 0) || Math.max(10, look.length * 3);
    sets.push({
      id, taskId, task, section: task.section, group: groupOf(task.section), setDay, windowFrom, path, items: look, all, status,
      minutes: reviewMinutes, bus: groupOf(task.section) === "V", online: task.kind === "cr_set",
    });
  }

  // Questions you sent in from GMAT Club: they come back as redos, and only count toward the topic.
  for (const s of d.shared) {
    const id = `share|${s.url}`;
    if (items.has(id)) continue;
    const it: Item = {
      id, review: "share", taskId: s.set ?? "share", pieceId: s.set ?? "share", source: "share", section: s.section, group: groupOf(s.section),
      topic: s.topic ?? "mixed", q: s.url, url: s.url, label: "The question you sent in (GMAT Club)", explanation: "the thread has the explanations",
      first: null, firstUnsure: false, firstMs: null, setDay: s.day,
      key: undefined, firstMark: "wrong", entered: true, state: "redo", misses: 1, dueFrom: windowAfter(s.day, d), rightRedoDay: null,
      lastDay: null, retiredDay: null, movedOnDay: null, needsTag: false, attempts: 0,
    };
    ladder(it, d, null);
    items.set(id, it);
  }

  let retired = 0, inReview = 0, movedOn = 0, errorsSoFar = 0;
  for (const it of items.values()) {
    // a question whose answer isn't known yet (a CR set before its review) isn't an error yet
    if (!it.entered || it.source === "rc" || it.firstMark === "unknown") continue;
    errorsSoFar++;
    if (it.state === "retired") retired++;
    else if (it.state === "movedon") movedOn++;
    else if (it.state === "review" || it.state === "redo" || it.state === "return") inReview++;
  }

  // A mixed review you started and didn't finish comes back as "Waiting where you left it".
  let openMixed: ReviewModel["openMixed"] = null;
  for (const [id, r] of d.reviewStarted) {
    if (!id.startsWith("mixed:") || d.reviewDone.has(id)) continue;
    const its = r.items.map((x) => items.get(x)).filter(Boolean) as Item[];
    if (its.length) openMixed = { id, items: its };
  }

  return { sets, setById: new Map(sets.map((s) => [s.id, s])), items, retired, inReview, movedOn, errorsSoFar, openMixed };
}

/** Is a redo or return free to come up today? (After a late night, today's newly due ones wait a day.) */
export function dueToday(it: Item, d: Derived, today: string): boolean {
  if (!it.dueFrom || (it.state !== "redo" && it.state !== "return")) return false;
  if (it.dueFrom > today) return false;
  if (it.dueFrom === today && d.lateSessions.has(plusDays(today, -1))) return false;
  return true;
}

export interface MixedFilter { bus: boolean; online: boolean; morning: boolean }

export function fitsItem(it: Item, f: MixedFilter): boolean {
  if (it.source === "cr" || it.source === "share") { if (!f.online) return false; }
  if (f.bus) return it.group === "V" && it.source !== "book";
  if (f.morning) return it.group === "Q";
  return true;
}

/**
 * Returns and second tries, grouped into a session of up to eight. No two neighbours share a topic
 * where that can be helped; weaker topics come a little more often (spec: Mixed review chips).
 */
export function mixedSession(m: ReviewModel, d: Derived, today: string, f: MixedFilter, weight: (topic: string) => number = () => 1): Item[] {
  const busy = new Set<string>();
  for (const [id, r] of d.reviewStarted) if (id.startsWith("mixed:") && !d.reviewDone.has(id)) r.items.forEach((x) => busy.add(x));
  const due = [...m.items.values()].filter((it) => !busy.has(it.id) && dueToday(it, d, today) && fitsItem(it, f));
  due.sort((a, b) => (weight(b.topic) - weight(a.topic)) || (a.dueFrom! < b.dueFrom! ? -1 : a.dueFrom! > b.dueFrom! ? 1 : 0));
  const take = due.slice(0, MIXED_SIZE);
  // spread the topics so neighbours differ
  const out: Item[] = [];
  const pool = [...take];
  while (pool.length) {
    const prev = out[out.length - 1]?.topic;
    const i = pool.findIndex((x) => x.topic !== prev);
    out.push(pool.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out;
}

/**
 * The day a review naturally lands: quant and DI at the first desk slot from its window (a morning,
 * or Saturday); reading and CR at the first day with a ride or a desk slot.
 */
export function reviewDay(s: SetReview, settings: Settings): string {
  for (let i = 0; i < 14; i++) {
    const day = plusDays(s.windowFrom, i);
    const c = dayCapacity(day, settings);
    if (s.group === "Q" ? c.desk > 0 : c.desk + c.bus > 0) return day;
  }
  return s.windowFrom;
}

/** The set reviews a week asks for: the ones that naturally land in that week. */
export function weekReviews(m: ReviewModel, weekStart: string, settings: Settings): SetReview[] {
  return m.sets.filter((s) => s.status !== "none" && weekStartOf(reviewDay(s, settings)) === weekStart);
}
