// When life happens (spec: When life happens). Lost time is absorbed quietly; you only hear about it
// when the finish date stops working, and even then moving it is offered first.

import { DAY_NAMES, addDays, parseYmd, plusDays, weekStartOf, ymd } from "./calendar";
import type { EventBody } from "./events";
import type { Settings } from "./settings";
import type { Derived } from "./state";
import { WEEK_CAP_MIN } from "./settings";

// ---------------------------------------------------------------- something came up

export type LifeKind = "tonight" | "weekend" | "week";

/** The days a "something came up" covers. In advance: pass the day it starts. */
export function lifeRange(kind: LifeKind, today: string, startingOn?: string): { from: string; to: string } {
  const base = startingOn ?? today;
  if (kind === "tonight") return { from: base, to: base };
  if (kind === "weekend") {
    const d = parseYmd(base);
    const toSat = (6 - d.getDay() + 7) % 7;
    const sat = d.getDay() === 0 ? plusDays(base, -1) : plusDays(base, toSat);
    const from = sat < base ? base : sat;
    return { from, to: plusDays(sat, 1) };
  }
  const ws = startingOn ? weekStartOf(startingOn) : weekStartOf(today);
  return { from: ws < today ? today : ws, to: plusDays(ws, 6) };
}

export function lifeMessage(kind: LifeKind, moved: number, startingOn?: string): string {
  if (kind === "tonight") return moved ? `Tonight's clear. ${moved === 1 ? "One chip that doesn't fit the rest of the week moved" : `${moved} chips that don't fit the rest of the week moved`} to next week.` : "Tonight's clear. The rest of the week holds everything.";
  if (kind === "weekend") return "Weekend's clear.";
  return `${startingOn ? "That" : "This"} week is a bus week: 4–5 hours of reading, videos and cards. It still counts as a week done.`;
}

// ---------------------------------------------------------------- the date check

export type CheckResult = "safe" | "risk" | "past";

export interface DateCheck {
  result: CheckResult;
  projected: string | null;
  target: string | null;
  extraPerWeek: number | null;      // desk minutes a week it would take to keep the date
}

export function targetDate(s: Settings): string | null {
  return s.testDate ?? s.finishDate ?? s.agreedFinish;
}

export function dateCheck(projected: string | null, target: string | null, extraPerWeek: number | null): DateCheck {
  if (!target || (projected && projected <= target)) return { result: "safe", projected, target, extraPerWeek: 0 };
  if (extraPerWeek !== null) return { result: "risk", projected, target, extraPerWeek };
  return { result: "past", projected, target, extraPerWeek: null };
}

/** What "keep the date" adds, as slots: one more morning, or Sunday 10:00–12:00. Never past 15 hours. */
export function keepDatePlan(s: Settings, extraPerWeek: number): { words: string; patch: Partial<Settings> } | null {
  const morning = 45;
  const mornings = { ...s.mornings, days: [...s.mornings.days] };
  let added = 0;
  const names: string[] = [];
  for (const wd of [1, 5, 2, 3, 4]) {
    if (added >= extraPerWeek) break;
    if (mornings.days.includes(wd)) continue;
    mornings.days.push(wd);
    mornings.days.sort();
    added += morning;
    names.push(DAY_NAMES[wd]);
  }
  const patch: Partial<Settings> = { mornings };
  let words = names.length === 1 ? `one more morning (${names[0]})` : names.length ? `${names.length} more mornings (${names.join(", ")})` : "";
  if (added < extraPerWeek) {
    const sat = s.saturday;
    if (!sat.days.includes(0)) {
      patch.saturday = { ...sat, days: [...sat.days, 0] };
      words = words ? `${words}, and Sunday ${sat.start}–${sat.end}` : `Sunday ${sat.start}–${sat.end}`;
      added += 240;
    }
  }
  if (added < extraPerWeek) return null;
  return { words, patch };
}

/** The week's total stays at 15 hours or less, whatever is chosen. */
export function withinCap(rawWeekMinutes: number, extra: number): boolean {
  return rawWeekMinutes + extra <= WEEK_CAP_MIN;
}

// ---------------------------------------------------------------- skips

/** The same task skipped 3 times in a week moves to next week. */
export function skippedOut(d: Derived, pieceId: string, weekStart: string): boolean {
  const end = plusDays(weekStart, 6);
  return d.skips.filter((s) => s.piece === pieceId && s.day >= weekStart && s.day <= end).length >= 3;
}

/** Any task skipped in three different weeks gets one question: keep it, or let it go? */
export function askLetGo(d: Derived, taskOf: (pieceId: string) => string | undefined): string | null {
  const weeks = new Map<string, Set<string>>();
  for (const s of d.skips) {
    const t = taskOf(s.piece);
    if (!t) continue;
    const w = weeks.get(t) ?? new Set();
    w.add(weekStartOf(s.day));
    weeks.set(t, w);
  }
  for (const [t, w] of weeks) if (w.size >= 3 && !d.letgo.has(t)) return t;
  return null;
}

// ---------------------------------------------------------------- back after a gap

export const WARM_WELCOME_AFTER = 7;

/** After the mornings were skipped two weeks running, the Sunday note says it once. */
export function morningsSkippedTwice(d: Derived, s: Settings, weekStart: string): boolean {
  const usedMorning = (ws: string) => {
    for (let i = 0; i < 7; i++) {
      const day = ymd(addDays(parseYmd(ws), i));
      if (!s.mornings.days.includes(parseYmd(day).getDay())) continue;
      if (d.morningDays.has(day)) return true;
    }
    return false;
  };
  const prev = plusDays(weekStart, -7);
  return s.mornings.days.length > 0 && !usedMorning(weekStart) && !usedMorning(prev);
}

export function lifeEvent(kind: LifeKind, today: string, startingOn?: string): EventBody {
  const r = lifeRange(kind, today, startingOn);
  return { type: "lifeup", kind, from: r.from, to: r.to };
}
