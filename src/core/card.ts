// What goes on the one card (spec: How the app decides what's on the card).
// Step 1 filters out what doesn't fit right now; step 2 walks a fixed priority list; step 3 fits it
// to the time there is.

import { inPause, isLateNight, plusDays, slotAt, type SlotNow } from "./calendar";
import { CARDS_PRIORITY_AT } from "./cards";
import type { MixChoice } from "./events";
import type { ExtraPiece } from "./extras";
import { skippedOut } from "./life";
import { sectionOfMix, type MixSection } from "./mix";
import type { EndPhase } from "./mocks";
import type { Piece } from "./pieces";
import { fitsItem, mixedSession, type Item, type ReviewModel, type SetReview } from "./review";
import type { Settings } from "./settings";
import type { Derived } from "./state";
import type { WeekPlan } from "./week";

export type Card =
  | { kind: "warmup"; step: "mba" | "wait" }
  | { kind: "pause" }
  | { kind: "late"; moved: boolean }
  | { kind: "back" }
  | { kind: "end"; phase: Exclude<EndPhase, "plan" | "taper" | "testweek"> }
  | { kind: "resume"; piece: Piece; progress: { done: number; total: number } }
  | { kind: "resumeReview"; review: string; set: SetReview | null; items: Item[] }
  | { kind: "mock"; piece: Piece }
  | { kind: "review"; set: SetReview }
  | { kind: "mixed"; items: Item[]; returning: number; stubborn?: boolean }
  | { kind: "redo"; piece: ExtraPiece }
  | { kind: "task"; piece: Piece; next: Piece | null; ahead?: boolean }
  | { kind: "cards"; due: number; why: "due" | "late" | "back" | "fallback" | "weekdone" | "end" }
  | { kind: "weekdone" }
  | { kind: "nothing"; why: "bus" | "offline" | "slot" | "slotEnding" | "skipped" };

export interface CardCtx {
  now: Date;
  today: string;
  settings: Settings;
  pieces: Piece[];                 // the plan
  byId: Map<string, Piece>;        // plan and extras
  week: WeekPlan | null;
  d: Derived;
  bus: boolean;
  online: boolean;
  mix: MixChoice;
  first?: MixSection;
  timeBudget: number | null;
  reviews?: ReviewModel;
  extras?: ExtraPiece[];           // this week's extras that are free to come up
  cardsDue?: number;
  phase?: EndPhase;
  back?: boolean;                  // seven days or more away, and the welcome not yet seen today
  letGo?: Set<string>;
  topicWeight?: (topic: string) => number;
}

/** Does this piece fit what's happening right now? (Step 1) */
export function fitsNow(p: Piece, c: CardCtx, slot: SlotNow | null): boolean {
  // no signal rules out anything that needs it, on the bus too, so the card moves to something that works
  if (!c.online && !p.offlineOk) return false;
  if (c.bus) return p.busOk;
  if (slot?.kind === "morning") {
    // Desk work that fits the slot: quant and DI; never a mock or a full LSAT set.
    // With 10 minutes left, no new piece starts.
    if (p.group !== "Q" || p.task.kind === "mock") return false;
    if (slot.minutesLeft <= 10) return false;
    return p.minutes <= slot.minutesLeft;
  }
  return true;
}

function reviewFits(s: SetReview, c: CardCtx, slot: SlotNow | null): boolean {
  if (s.online && !c.online) return false;
  if (c.bus) return s.bus;
  if (slot?.kind === "morning") return s.group === "Q" && slot.minutesLeft > 10 && s.minutes <= slot.minutesLeft + 5;
  return true;
}

function taskDone(taskId: string, c: CardCtx): boolean {
  if (c.letGo?.has(taskId)) return true;
  return c.pieces.filter((p) => p.taskId === taskId).every((p) => c.d.done.has(p.id));
}

function ready(p: Piece, c: CardCtx): boolean {
  if (p.index > 0 && !c.d.done.has(`${p.taskId}#${p.index - 1}`)) return false; // halves in order
  return p.task.depends_on.every((t) => taskDone(t, c));
}

/**
 * Has any work gone in? A set you only opened isn't "waiting where you left it". Work that happens on
 * another site (GMAT Club, mba.com) starts when you open it, so it counts as started.
 */
function hasProgress(p: Piece, c: CardCtx): boolean {
  const k = p.task.kind;
  if (k === "og_set") return (c.d.answers.get(p.id)?.size ?? 0) > 0;
  if (k === "rc_section") return c.d.rcPlace.has(p.id) || (c.d.answers.get(p.id)?.size ?? 0) > 0;
  if (k === "drill") return c.d.drills.has(p.id);
  if (k === "video" || (k === "test_prep" && p.task.pointer.youtube_id)) return (c.d.video.get(p.id)?.seconds ?? 0) >= 30;
  if (k === "recall") return [...c.d.seen.keys()].some((x) => x.startsWith(`recall-group:${p.id}:`));
  if (k === "cards") return false;
  if (k === "article" && p.task.pointer.type === "book_chapter") return false;   // reading in your own copy: nothing to resume
  return true;
}

function progressOf(p: Piece, c: CardCtx) {
  const total = p.count ?? 0;
  const place = c.d.rcPlace.get(p.id);
  if (p.task.kind === "rc_section" && place) return { done: place.passage, total: (p.task.pointer.passages as number[] | undefined)?.length ?? 4 };
  const answered = c.d.answers.get(p.id)?.size ?? 0;
  return { done: answered, total: total || Math.max(answered, 1) };
}

const TIMED = (p: Piece) => p.task.kind === "mock" || !!p.task.timed;

export function chooseCard(c: CardCtx): Card {
  if (c.today < c.settings.startDate) {
    return { kind: "warmup", step: c.d.admin.get("warmup-mba") ? "wait" : "mba" };
  }
  const phase = c.phase ?? "plan";
  const due = c.cardsDue ?? 0;
  if (phase === "testday" || phase === "daybefore" || phase === "checklist" || phase === "after") return { kind: "end", phase };
  if (phase === "cardsonly") return due ? { kind: "cards", due, why: "end" } : { kind: "end", phase };
  // a pause week, or a pause day inside a week (holidays): nothing on the plan
  if (c.week?.pause || inPause(c.today, c.settings)) return { kind: "pause" };
  if (isLateNight(c.now, c.settings)) {
    // After 11 pm, only cards, or nothing tonight. Past 11:30, tomorrow's redos move a day.
    const moved = c.d.lateSessions.has(c.today);
    return due ? { kind: "cards", due, why: "late" } : { kind: "late", moved };
  }
  if (c.back) return { kind: "back" };

  const slot = c.bus ? null : slotAt(c.now, c.settings);
  const fit = (p: Piece) => fitsNow(p, c, slot);
  const skipped = c.d.skipsByDay.get(c.today) ?? new Set<string>();
  const extras = c.extras ?? [];
  const R = c.reviews;

  // 1. Anything unfinished: a set you were in the middle of, or a review you didn't complete.
  const open = [...c.d.started.entries()]
    .filter(([id]) => !c.d.done.has(id) && c.byId.has(id) && !skipped.has(id) && hasProgress(c.byId.get(id)!, c))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => c.byId.get(id)!)
    .find(fit);
  if (open) return { kind: "resume", piece: open, progress: progressOf(open, c) };
  if (R) {
    const s = R.sets.find((x) => x.status === "started" && reviewFits(x, c, slot));
    if (s) return { kind: "resumeReview", review: s.id, set: s, items: s.items };
    if (R.openMixed && R.openMixed.items.some((it) => fitsItem(it, { bus: c.bus, online: c.online, morning: slot?.kind === "morning" }))) {
      return { kind: "resumeReview", review: R.openMixed.id, set: null, items: R.openMixed.items };
    }
  }

  const chips = (c.week?.chips ?? []).map((ch) => c.byId.get(ch.pieceId)!).filter(Boolean);
  const todo = chips.filter((p) => !c.d.done.has(p.id) && !c.letGo?.has(p.taskId));

  // 2. Today's mock, on the day it's planned (or moved to), off the bus.
  if (!c.bus) {
    const mock = todo.find((p) => p.task.kind === "mock" && ready(p, c) && (c.d.mockMoved.get(p.id) ?? c.week?.mockDay ?? "9999") <= c.today);
    if (mock && slot?.kind !== "morning" && (c.online || mock.offlineOk)) return { kind: "mock", piece: mock };
    if (phase === "taper" && slot?.kind !== "morning" && c.online) {
      const blockDay = c.settings.saturday.enabled && c.settings.saturday.days.includes(c.now.getDay());
      const last = c.pieces.find((p) => p.task.kind === "mock" && p.task.pointer.type === "official_mock" && !c.d.done.has(p.id) && !c.letGo?.has(p.taskId)
        && (c.d.mockMoved.get(p.id) ? c.d.mockMoved.get(p.id)! <= c.today : blockDay));
      if (last) return { kind: "mock", piece: last };
    }
  }

  // 3. Redos that are due: set reviews, mixed returns and second tries, drill repeats, passages.
  if (R) {
    const sets = R.sets.filter((s) => s.status === "open" && !skipped.has(s.id) && reviewFits(s, c, slot)).sort((a, b) => (a.windowFrom < b.windowFrom ? -1 : 1));
    if (sets.length) return { kind: "review", set: sets[0] };
    if (!skipped.has("mixed")) {
      const items = mixedSession(R, c.d, c.today, { bus: c.bus, online: c.online, morning: slot?.kind === "morning" }, c.topicWeight);
      const fitsSlot = slot?.kind !== "morning" || (slot.minutesLeft > 10 && items.length * 3 <= slot.minutesLeft);
      if (items.length && fitsSlot) return { kind: "mixed", items, returning: items.filter((it) => it.state === "return" || it.state === "look").length };
      const stubborn = mixedSession(R, c.d, c.today, { bus: c.bus, online: c.online, morning: slot?.kind === "morning" }, c.topicWeight, true);
      if (stubborn.length && fitsSlot && !skipped.has("stubborn")) return { kind: "mixed", items: stubborn, returning: 0, stubborn: true };
    }
  }
  if (phase === "testweek") return due ? { kind: "cards", due, why: "end" } : { kind: "weekdone" };
  const redo = extras.find((x) => (x.xkind === "drill" || x.xkind === "passage") && !skipped.has(x.id) && fit(x) && x.availableFrom <= c.today);
  if (redo) return { kind: "redo", piece: redo };
  // your error log, from memory (the week's, or the sweep before a mock): review work, so it comes before new work
  const sweepOver = (x: ExtraPiece) => { const o = x.spec?.open; return o?.type === "recall" && !!o.sweep && c.d.done.has(o.sweep); };
  const recall = extras.find((x) => x.xkind === "recall" && !skipped.has(x.id) && !sweepOver(x) && fit(x));
  if (recall) return { kind: "task", piece: recall, next: null };

  // 4. Today's mix from this week's chips, and top-ups and help chips by their section.
  // In the last two weeks before the test: the last mock or a timed section, then light review.
  const sideWork = extras.filter((x) => !x.hidden && !["drill", "passage", "extra", "recall"].includes(x.xkind) && !(phase === "taper" && x.xkind !== "keepsharp"));
  const pool = [...todo.filter((p) => phase !== "taper" || TIMED(p)), ...sideWork];
  const candidates = pool.filter((p) => ready(p, c) && fit(p) && p.task.kind !== "mock" && !skipped.has(p.id) && !skippedOut(c.d, p.id, c.week?.weekStart ?? c.today));
  if (!candidates.length && slot?.kind === "morning" && slot.minutesLeft > 10) {
    // Quant or DI work waiting on a video (e.g. week 1's "watch this first"): the morning takes the video.
    const blockedQ = todo.filter((p) => p.group === "Q" && !ready(p, c));
    const unlock = todo.find((p) => !skipped.has(p.id) && ready(p, c) && (!c.online ? p.offlineOk : true) && p.minutes <= slot.minutesLeft
      && blockedQ.some((q) => q.task.depends_on.includes(p.taskId)));
    if (unlock) return { kind: "task", piece: unlock, next: null };
  }
  if (candidates.length) {
    const pick = pickFromMix(candidates, c, lastGroupToday(c));
    const rest = candidates.filter((p) => p.id !== pick.id);
    const next = rest.length ? pickFromMix(rest, c, pick.group) : null;
    return { kind: "task", piece: pick, next };
  }

  // 5. The week's one extra-practice chip, once the required chips are done.
  const requiredLeft = todo.filter((p) => !skippedOut(c.d, p.id, c.week?.weekStart ?? c.today)).length;
  if (!requiredLeft && phase !== "taper") {
    const extra = extras.find((x) => x.xkind === "extra" && !skipped.has(x.id) && fit(x));
    if (extra) return { kind: "task", piece: extra, next: null };
  }

  // 6. Flashcards, if at least ten are due.
  if (due >= CARDS_PRIORITY_AT) return { kind: "cards", due, why: "due" };

  // The bus is ahead of the desk: a reserve CR set, never next week's plan.
  if (c.bus && requiredLeft && c.online && phase === "plan") {
    const reserve = extras.find((x) => x.xkind === "reserve" && !c.d.done.has(x.id) && !skipped.has(x.id));
    if (reserve) return { kind: "task", piece: reserve, next: null };
  }

  // 7. The week's work is done early: offer next week's first task (it never changes the week that counted).
  if (chips.length && !requiredLeft && phase === "plan") {
    const inWeek = new Set(chips.map((p) => p.id));
    const ahead = c.pieces.find((p) => !c.d.done.has(p.id) && !inWeek.has(p.id) && !c.letGo?.has(p.taskId) && p.task.kind !== "mock" && ready(p, c));
    if (ahead && fit(ahead) && !skipped.has(ahead.id)) return { kind: "task", piece: ahead, next: null, ahead: true };
  }
  if (chips.length && !requiredLeft) return { kind: "weekdone" };

  // Everything is filtered out: cards if there are any, otherwise say so.
  if (due) return { kind: "cards", due, why: "fallback" };
  if (todo.some((p) => skipped.has(p.id) && fit(p))) return { kind: "nothing", why: "skipped" };
  if (slot?.kind === "morning" && slot.minutesLeft <= 10) return { kind: "nothing", why: "slotEnding" };
  return { kind: "nothing", why: c.bus ? "bus" : !c.online ? "offline" : "slot" };
}

function lastGroupToday(c: CardCtx): "Q" | "V" | null {
  let best: { ts: number; g: "Q" | "V" } | null = null;
  for (const [id, ts] of c.d.started) {
    const p = c.byId.get(id);
    if (!p || p.group === "O") continue;
    if (new Date(ts).toDateString() !== c.now.toDateString()) continue;
    if (!best || ts > best.ts) best = { ts, g: p.group };
  }
  return best?.g ?? null;
}

/** Plan order within each section; take turns between quant/DI and verbal (spec: Today's mix). */
export function pickFromMix(cands: Piece[], c: CardCtx, lastGroup: "Q" | "V" | "O" | null): Piece {
  const bySection = (m: MixSection) => cands.filter((p) => sectionOfMix(p.section) === m);
  if (c.mix !== "mix") {
    const only = bySection(c.mix);
    if (only.length) return only[0];
  }
  // First in the mix: a section that hasn't come up lately, if nothing's been done today.
  if (c.mix === "mix" && c.first && lastGroup === null) {
    const f = bySection(c.first);
    if (f.length) return f[0];
  }
  const wantQ = lastGroup === "V" || lastGroup === "O" ? true : lastGroup === "Q" ? false : true;
  const q = cands.filter((p) => p.group === "Q");
  const v = cands.filter((p) => p.group !== "Q");
  const pool = (wantQ ? q : v).length ? (wantQ ? q : v) : wantQ ? v : q;
  if (pool === q && q.length) {
    // Quant and DI take turns, leaning toward whichever has more left this week.
    const left = (m: MixSection) => bySection(m).reduce((s, p) => s + p.minutes, 0);
    const quant = bySection("quant"), di = bySection("di");
    if (quant.length && di.length) return left("di") > left("quant") ? di[0] : quant[0];
    return q[0];
  }
  return pool[0];
}

/** "Instead: …" after a Skip: the week's extra chip if it's unlocked, otherwise the next chip from a different section. */
export function alternativeFor(p: Piece, c: CardCtx): Piece | null {
  const slot = c.bus ? null : slotAt(c.now, c.settings);
  const skippedToday = c.d.skipsByDay.get(c.today) ?? new Set();
  const chips = (c.week?.chips ?? []).map((ch) => c.byId.get(ch.pieceId)!).filter(Boolean);
  const todo = chips.filter((x) => !c.d.done.has(x.id));
  const extra = (c.extras ?? []).find((x) => x.xkind === "extra" && !c.d.done.has(x.id));
  if (extra && !todo.length && fitsNow(extra, c, slot)) return extra;
  const cands = todo.filter((x) => x.id !== p.id && !skippedToday.has(x.id) && x.section !== p.section && x.task.kind !== "mock" && fitsNow(x, c, slot) && ready(x, c));
  return cands.length ? pickFromMix(cands, c, p.group) : null;
}

export const tomorrowOf = (today: string) => plusDays(today, 1);
