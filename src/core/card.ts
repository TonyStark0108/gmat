// What goes on the one card (spec: How the app decides what's on the card).
// Step 1 filters out what doesn't fit right now; step 2 walks a fixed priority list.

import { isLateNight, slotAt, type SlotNow } from "./calendar";
import type { MixChoice } from "./events";
import { sectionOfMix, type MixSection } from "./mix";
import type { Piece } from "./pieces";
import type { Settings } from "./settings";
import type { Derived } from "./state";
import type { WeekPlan } from "./week";

export type Card =
  | { kind: "warmup"; step: "mba" | "wait" }
  | { kind: "pause" }
  | { kind: "late" }
  | { kind: "resume"; piece: Piece; progress: { done: number; total: number } }
  | { kind: "mock"; piece: Piece }
  | { kind: "task"; piece: Piece; next: Piece | null }
  | { kind: "weekdone" }
  | { kind: "nothing"; why: "bus" | "offline" | "slot" | "slotEnding" | "skipped" };

export interface CardCtx {
  now: Date;
  today: string;
  settings: Settings;
  pieces: Piece[];
  byId: Map<string, Piece>;
  week: WeekPlan | null;
  d: Derived;
  bus: boolean;
  online: boolean;
  mix: MixChoice;
  first?: MixSection;
  timeBudget: number | null;
}

/** Does this piece fit what's happening right now? (Step 1) */
export function fitsNow(p: Piece, c: CardCtx, slot: SlotNow | null): boolean {
  if (c.bus) return p.busOk;
  if (!c.online && !p.offlineOk) return false;
  if (slot?.kind === "morning") {
    // Desk work that fits the slot: quant and DI; never a mock or a full LSAT set.
    // With 10 minutes left, no new piece starts.
    if (p.group !== "Q" || p.task.kind === "mock") return false;
    if (slot.minutesLeft <= 10) return false;
    return p.minutes <= slot.minutesLeft;
  }
  return true;
}

function taskDone(taskId: string, c: CardCtx): boolean {
  return c.pieces.filter((p) => p.taskId === taskId).every((p) => c.d.done.has(p.id));
}

function ready(p: Piece, c: CardCtx): boolean {
  if (p.index > 0 && !c.d.done.has(`${p.taskId}#${p.index - 1}`)) return false; // halves in order
  return p.task.depends_on.every((t) => taskDone(t, c));
}

function progressOf(p: Piece, c: CardCtx) {
  const total = p.count ?? 0;
  const place = c.d.rcPlace.get(p.id);
  if (p.task.kind === "rc_section" && place) return { done: place.passage, total: 4 };
  const answered = c.d.answers.get(p.id)?.size ?? 0;
  return { done: answered, total: total || Math.max(answered, 1) };
}

export function chooseCard(c: CardCtx): Card {
  if (c.today < c.settings.startDate) {
    return { kind: "warmup", step: c.d.admin.get("warmup-mba") ? "wait" : "mba" };
  }
  if (c.week?.pause) return { kind: "pause" };
  if (isLateNight(c.now, c.settings)) return { kind: "late" };

  const slot = c.bus ? null : slotAt(c.now, c.settings);
  const fit = (p: Piece) => fitsNow(p, c, slot);

  // 1. Anything unfinished: a set you were in the middle of.
  const open = [...c.d.started.entries()]
    .filter(([id]) => !c.d.done.has(id) && c.byId.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => c.byId.get(id)!)
    .find(fit);
  if (open) return { kind: "resume", piece: open, progress: progressOf(open, c) };

  const chips = (c.week?.chips ?? []).map((ch) => c.byId.get(ch.pieceId)!).filter(Boolean);
  const todo = chips.filter((p) => !c.d.done.has(p.id));
  if (chips.length && !todo.length) return { kind: "weekdone" };

  // 2. Today's mock, on the day it's planned, off the bus.
  if (!c.bus && c.week?.mockDay && c.today >= c.week.mockDay) {
    const mock = todo.find((p) => p.task.kind === "mock" && ready(p, c));
    if (mock && slot?.kind !== "morning") return { kind: "mock", piece: mock };
  }

  // 3. Redos that are due (Phase 2).

  // 4. Today's mix from this week's chips.
  const skipped = c.d.skipsByDay.get(c.today) ?? new Set<string>();
  const candidates = todo.filter((p) => ready(p, c) && fit(p) && p.task.kind !== "mock" && !skipped.has(p.id));
  if (!candidates.length && slot?.kind === "morning" && slot.minutesLeft > 10) {
    // Quant or DI work waiting on a video (e.g. week 1's "watch this first"): the morning takes the video.
    const blockedQ = todo.filter((p) => p.group === "Q" && !ready(p, c));
    const unlock = todo.find((p) => !skipped.has(p.id) && ready(p, c) && (!c.online ? p.offlineOk : true) && p.minutes <= slot.minutesLeft
      && blockedQ.some((q) => q.task.depends_on.includes(p.taskId)));
    if (unlock) return { kind: "task", piece: unlock, next: null };
  }
  if (!candidates.length) {
    if (todo.some((p) => skipped.has(p.id) && fit(p))) return { kind: "nothing", why: "skipped" };
    if (slot?.kind === "morning" && slot.minutesLeft <= 10) return { kind: "nothing", why: "slotEnding" };
    return { kind: "nothing", why: c.bus ? "bus" : !c.online ? "offline" : "slot" };
  }
  const pick = pickFromMix(candidates, c, lastGroupToday(c));
  const rest = candidates.filter((p) => p.id !== pick.id);
  const next = rest.length ? pickFromMix(rest, c, pick.group) : null;
  return { kind: "task", piece: pick, next };
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
