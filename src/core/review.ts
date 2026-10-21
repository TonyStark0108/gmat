// Log now, review later; the life of a wrong answer (spec: After a set; The life of a wrong answer).
//
// A set is logged on submit. Its review opens 1–3 days later: a blind retry of the wrong and not-sure
// ones, right-or-wrong dots, a last try, the answers, then tags. Each question then follows the redo
// ladder: Redo → Return (14–21 days later) → Retired (right twice, a week or more apart), or Moved on
// after three misses. Everything here is computed from the event log; nothing is stored twice.
//
// Worth another look: a question you got right that you starred (or that took well over the plan's
// time) comes back about a week later, then about two weeks after that, mixed in with the returns.
// Right both times and it's off the list; wrong, and it becomes a mistake like any other.

import { dayCapacity, daysBetween, plusDays, weekStartOf } from "./calendar";
import { logTopic, qtypeSection, SOURCE_NAMES } from "./qlog";
import type { Settings } from "./settings";
import { pagesFor, type BookId, type Content, type Section, type Task } from "./content";
import type { Answer, Tag } from "./events";
import { markOne } from "./grid";
import { groupOf, type Group, type Piece } from "./pieces";
import type { Derived, ReviewAttempt } from "./state";
import { bookTopic } from "./topics";

export type ItemState = "fine" | "review" | "redo" | "return" | "retired" | "stubborn" | "done" | "look" | "looked";
export type ItemSource = "book" | "rc" | "cr" | "share" | "log";

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
  stubbornDay: string | null;   // when it first joined the stubborn queue
  needsTag: boolean;              // wrong on the first try: the review asks why
  tag?: Tag;
  line?: string;
  attempts: number;               // goes in reviews, not counting the last try
  look?: "starred" | "slow";      // worth another look: you starred it, or it was right but slow
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
  stubborn: number;
  look: number;                   // right ones waiting for another look
  errorsSoFar: number;
  openMixed: { id: string; items: Item[] } | null;
}

export const REDO_MIN_GAP = 1;
export const RETURN_AFTER = 14;
export const RETIRE_GAP = 7;
export const LAPSE_AFTER = 14;
export const STUBBORN_AT = 3;     // three misses: the question joins the stubborn queue (it never leaves)
export const STUBBORN_GAP = 10;   // and comes back ten days later, in its own session
export const MIXED_SIZE = 8;
export const LOOK_FIRST = 7;      // a starred or slow one comes back a week later,
export const LOOK_AGAIN = 14;     // then two weeks after a clean go; two clean goes and it's off the list
export const LOOK_SLIP_GAP = 3;   // a retired one you starred and missed comes back three days later

/** Right and sure, but slow: over the plan's flag time (2:30 for quant and DS, 3:00 for other DI). */
export function slowRight(it: Pick<Item, "firstMark" | "firstUnsure" | "firstMs" | "section" | "topic">): boolean {
  if (it.firstMark !== "right" || it.firstUnsure || it.firstMs === null) return false;
  if (it.section !== "quant" && it.section !== "di") return false;
  const limit = it.section === "di" && !it.topic.startsWith("ds · ") ? 180_000 : 150_000;
  return it.firstMs > limit && it.firstMs < 20 * 60_000;
}

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

function blank(base: Omit<Item, "key" | "firstMark" | "entered" | "state" | "misses" | "dueFrom" | "rightRedoDay" | "lastDay" | "retiredDay" | "stubbornDay" | "needsTag" | "attempts">, key: Answer | undefined): Item {
  const firstMark = markOf(base.first, key);
  const entered = firstMark !== "right" || base.firstUnsure;
  return { ...base, key, firstMark, entered, state: entered ? "review" : "fine", misses: firstMark === "wrong" ? 1 : 0, dueFrom: null,
    rightRedoDay: null, lastDay: null, retiredDay: null, stubbornDay: null, needsTag: firstMark === "wrong" || base.firstUnsure, attempts: 0 };
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
      const list = (task.pointer.list as number[] | undefined) ?? Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i);
      for (const n of list) {
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

const rightOf = (it: Item, a: ReviewAttempt) => a.right ?? (it.key !== undefined && it.key !== null && markOne(a.value, it.key as string | number[]) === "right");

/** Worth another look: two clean goes, spaced, and it's off the list. Returns the attempts left over if it turned into a mistake. */
function lookWalk(it: Item, atts: ReviewAttempt[], from: string, becomesError: boolean): ReviewAttempt[] | null {
  it.state = "look";
  it.dueFrom = plusDays(from, LOOK_FIRST);
  let clean = 0;
  for (let i = 0; i < atts.length; i++) {
    const a = atts[i];
    if (a.day < from) continue;
    it.attempts++;
    it.lastDay = a.day;
    if (rightOf(it, a)) {
      if (++clean >= 2) { it.state = "looked"; return null; }
      it.dueFrom = plusDays(a.day, LOOK_AGAIN);
    } else if (becomesError) {
      // wrong this time: from here on it's a mistake like any other (the review asks why)
      it.entered = true; it.needsTag = true; it.misses = 1; it.state = "redo"; it.dueFrom = plusDays(a.day, REDO_MIN_GAP);
      return atts.slice(i + 1);
    } else { clean = 0; it.dueFrom = plusDays(a.day, LOOK_SLIP_GAP); }
  }
  return null;
}

/** Walk an item's attempts through the redo ladder. */
function ladder(it: Item, d: Derived, setReview: { status: SetStatus; doneDay: string | null; windowFrom: string } | null) {
  // reading questions follow the same ladder as everything else (redone one by one, in the reader);
  // goes inside "your error log, from memory" are practice and never move the ladder
  const all = (d.attempts.get(it.id) ?? []).filter((a) => a.attempt !== "last" && a.attempt !== "recall");
  const look = d.looks.get(it.id);
  let atts = all;
  if (!it.entered) {
    if (!(look ? look.on : slowRight(it))) return;
    it.look = look?.on ? "starred" : "slow";
    const rest = lookWalk(it, all, look?.on && look.day > it.setDay ? look.day : it.setDay, true);
    if (!rest) return;
    atts = rest;
  }
  const tag = d.tags.get(it.id);
  if (tag) { it.tag = tag.tag; it.line = tag.line; }
  if (setReview && it.state === "review") it.dueFrom = setReview.windowFrom;
  for (const a of atts) {
    const right = rightOf(it, a);
    it.attempts++;
    it.lastDay = a.day;
    const miss = () => {
      it.misses++;
      if (it.misses >= STUBBORN_AT) { it.state = "stubborn"; it.stubbornDay ??= a.day; it.dueFrom = plusDays(a.day, STUBBORN_GAP); }
      else { it.state = "redo"; it.dueFrom = plusDays(a.day, REDO_MIN_GAP); }
    };
    if (it.state === "review" || it.state === "redo" || it.state === "stubborn") {
      if (right) { it.state = "return"; it.rightRedoDay = a.day; it.dueFrom = plusDays(a.day, RETURN_AFTER); }
      else miss();
    } else if (it.state === "return") {
      if (right && it.rightRedoDay && daysBetween(it.rightRedoDay, a.day) >= RETIRE_GAP) { it.state = "retired"; it.retiredDay = a.day; }
      else if (!right) miss();
    }
    if (it.state === "retired") break;
  }
  // a retired one you star again: it comes back for another look (it stays counted as retired)
  if (it.state === "retired" && look?.on && it.retiredDay && look.day >= it.retiredDay) {
    it.look = "starred";
    lookWalk(it, all, look.day, false);
  }
  if (it.state === "review" && setReview) {
    // the review finished without a blind retry for this one (the no-key path), or never happened
    if (setReview.status === "done") { it.state = "redo"; it.dueFrom = plusDays(setReview.doneDay!, REDO_MIN_GAP); }
    else if (setReview.status === "lapsed") { it.state = "redo"; it.dueFrom = plusDays(setReview.windowFrom, LAPSE_AFTER); }
  }
}

function setStatus(id: string, hasItems: boolean, windowFrom: string, d: Derived, today: string): SetStatus {
  if (d.reviewDone.has(id)) return "done";
  if (d.reviewStarted.has(id) && d.reviewTouched.has(id)) return "started";
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

  // Questions you sent in (any site, or a note of your own): they come back as redos.
  for (const s of d.shared) {
    const id = `share|${s.url || s.id}`;
    if (items.has(id)) continue;
    const site = s.url ? (s.url.match(/^https?:\/\/(?:www\.)?([^/]+)/)?.[1] ?? "the web") : null;
    const it: Item = {
      id, review: "share", taskId: s.set ?? "share", pieceId: s.set ?? "share", source: "share", section: s.section, group: groupOf(s.section),
      topic: s.topic ?? "mixed", q: s.url || s.id, url: s.url || undefined,
      label: s.url ? `The question you sent in (${site})` : `Your note: ${s.note ?? "a question"}`, explanation: s.url ? "the page has the explanation" : null,
      first: null, firstUnsure: false, firstMs: null, setDay: s.day,
      key: undefined, firstMark: "wrong", entered: true, state: "redo", misses: 1, dueFrom: windowAfter(s.day, d), rightRedoDay: null,
      lastDay: null, retiredDay: null, stubbornDay: null, needsTag: false, attempts: 0,
    };
    ladder(it, d, null);
    items.set(id, it);
  }

  // Questions logged from other official sources (the online question banks, Official Practice Questions):
  // right or wrong as you report it, with time and type; wrong and not-sure ones join the redo ladder.
  for (const q of d.qlogs) {
    const id = `log|${q.id}`;
    const section = qtypeSection(q.qtype);
    const it: Item = {
      id, review: "log", taskId: "log", pieceId: "log", source: "log", section, group: groupOf(section),
      topic: logTopic(q.qtype, q.topic), q: q.ref || q.id, url: q.url || undefined,
      label: `${SOURCE_NAMES[q.source] ?? q.source}${q.ref ? `, ${q.ref}` : ""}`, explanation: q.url ? "the page has the explanation" : "the source's own explanation",
      first: null, firstUnsure: q.unsure, firstMs: q.seconds ? q.seconds * 1000 : null, setDay: q.day,
      key: undefined, firstMark: q.result === "right" ? "right" : "wrong", entered: q.result === "wrong" || q.unsure,
      state: q.result === "wrong" || q.unsure ? "redo" : "fine", misses: q.result === "wrong" ? 1 : 0, dueFrom: windowAfter(q.day, d),
      rightRedoDay: null, lastDay: null, retiredDay: null, stubbornDay: null, needsTag: q.result === "wrong" || q.unsure, attempts: 0,
    };
    ladder(it, d, null);
    items.set(id, it);
  }

  let retired = 0, inReview = 0, stubborn = 0, errorsSoFar = 0, look = 0;
  // a retirement is kept even if a later correction (a failed spot check, "My book says…") changes the marking
  for (const id of d.retiredItems) { const it = items.get(id); if (!it || !it.entered || it.firstMark === "unknown") retired++; }
  for (const it of items.values()) {
    if (it.state === "look") look++;
    // a question whose answer isn't known yet (a CR set before its review) isn't an error yet
    if (!it.entered || it.firstMark === "unknown") continue;
    errorsSoFar++;
    if (it.retiredDay || d.retiredItems.has(it.id)) retired++;
    else if (it.state === "stubborn") stubborn++;
    else if (it.state === "review" || it.state === "redo" || it.state === "return") inReview++;
  }

  // A mixed review you started and didn't finish comes back as "Waiting where you left it".
  let openMixed: ReviewModel["openMixed"] = null;
  for (const [id, r] of d.reviewStarted) {
    if (!id.startsWith("mixed:") || d.reviewDone.has(id) || !d.reviewTouched.has(id)) continue;
    const its = r.items.map((x) => items.get(x)).filter(Boolean) as Item[];
    if (its.length) openMixed = { id, items: its };
  }

  return { sets, setById: new Map(sets.map((s) => [s.id, s])), items, retired, inReview, stubborn, look, errorsSoFar, openMixed };
}

/** Is a redo or return free to come up today? (After a late night, today's newly due ones wait a day.) */
export function dueToday(it: Item, d: Derived, today: string): boolean {
  if (!it.dueFrom || (it.state !== "redo" && it.state !== "return" && it.state !== "stubborn" && it.state !== "look")) return false;
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
export function mixedSession(m: ReviewModel, d: Derived, today: string, f: MixedFilter, weight: (topic: string) => number = () => 1, stubborn = false): Item[] {
  const busy = new Set<string>();
  for (const [id, r] of d.reviewStarted) if (id.startsWith("mixed:") && !d.reviewDone.has(id) && d.reviewTouched.has(id)) r.items.forEach((x) => busy.add(x));
  // the stubborn ones get their own session, so they don't crowd the regular redos
  const due = [...m.items.values()].filter((it) => !busy.has(it.id) && dueToday(it, d, today) && fitsItem(it, f) && (it.state === "stubborn") === stubborn);
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
