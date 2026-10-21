// Mocks, Ready, booking and the end game (spec: Mock; A finish date, not a test date; The end game).

import { addDays, daysBetween, parseYmd, plusDays, weekStartOf, ymd } from "./calendar";
import type { Piece } from "./pieces";
import type { Derived } from "./state";
import { READY_MARGIN } from "./settings";

export interface MockResult {
  pieceId: string;
  exam: number | null;           // official exam number; null for timed sections
  official: boolean;
  practiceRun: boolean;
  fresh: boolean;                // not a retake of an exam you've seen
  planWeek: number;
  day: string;
  total: number | null;
  quant: number | null;
  verbal: number | null;
  di: number | null;
}

const EXAMS_3_6 = "w07-general-01#0";   // "Decide on Official Practice Exams 3–6"

export function mockResults(pieces: Piece[], d: Derived): MockResult[] {
  const out: MockResult[] = [];
  const seenExam = new Set<number>();
  const done = pieces.filter((p) => p.task.kind === "mock" && d.done.has(p.id)).sort((a, b) => d.doneAt.get(a.id)!.ts - d.doneAt.get(b.id)!.ts);
  for (const p of done) {
    const ptr = p.task.pointer;
    const official = ptr.type === "official_mock";
    const exam = official ? (ptr.exam ?? null) : null;
    const sc = d.outside.get(p.id)?.scores ?? {};
    const fresh = official && exam !== null && !seenExam.has(exam);
    if (exam !== null) seenExam.add(exam);
    out.push({ pieceId: p.id, exam, official, practiceRun: !!ptr.practice_run, fresh, planWeek: p.planWeek, day: d.doneAt.get(p.id)!.day,
      total: sc.total ?? null, quant: sc.quant ?? null, verbal: sc.verbal ?? null, di: sc.di ?? null });
  }
  return out;
}

export const boughtExams36 = (d: Derived) => d.admin.get(EXAMS_3_6)?.answer === "done";

/**
 * Ready, worked out fresh every time (never stored): the last two fresh official mocks are both within
 * 10 of your target, and the latest isn't lower than the one before. One good mock is not enough.
 */
export function isReady(mocks: MockResult[], target: number): boolean {
  const fresh = mocks.filter((m) => m.official && m.fresh && !m.practiceRun && m.total !== null);
  if (fresh.length < 2) return false;
  const [a, b] = fresh.slice(-2);
  return a.total! >= target - READY_MARGIN && b.total! >= target - READY_MARGIN && b.total! >= a.total!;
}

export interface BookingCard { why: "ready" | "bookby"; suggest: string }

/** The booking card: at Ready, or at the book-by date. "Not yet" hides it for two weeks. */
export function bookingCard(d: Derived, ready: boolean, today: string): BookingCard | null {
  const s = d.settings;
  if (s.testDate) return null;
  if (!ready && today < s.bookBy) return null;
  const lastNo = d.booking.filter((b) => b.answer === "notyet").pop();
  if (lastNo && daysBetween(lastNo.day, today) < 14) return null;
  // 3–4 weeks out, leaving room for a retake (16 days apart, plus a little) before the hard stop
  let suggest = plusDays(today, 25);
  const latest = plusDays(s.hardStop, -30);
  if (suggest > latest) suggest = latest < plusDays(today, 14) ? plusDays(today, 14) : latest;
  return { why: ready ? "ready" : "bookby", suggest };
}

export type EndPhase = "plan" | "taper" | "testweek" | "checklist" | "cardsonly" | "daybefore" | "testday" | "after";

export function endPhase(testDate: string | null, today: string): EndPhase {
  if (!testDate) return "plan";
  const left = daysBetween(today, testDate);
  if (left < 0) return "after";
  if (left === 0) return "testday";
  if (left === 1) return "daybefore";
  if (left === 2) return "cardsonly";
  if (left === 3) return "checklist";
  if (weekStartOf(today) === weekStartOf(testDate) && parseYmd(today).getDay() >= 1 && parseYmd(today).getDay() <= 3) return "testweek";
  if (left <= 14) return "taper";
  return "plan";
}

/** "Move it": the next free weekend day; later mocks stay at least 7 days apart. */
export function moveMockDay(today: string, lastMockDay: string | null): string {
  let t = addDays(parseYmd(today), 1);
  for (let i = 0; i < 21; i++, t = addDays(t, 1)) {
    const day = ymd(t);
    const wd = t.getDay();
    if ((wd === 6 || wd === 0) && (!lastMockDay || daysBetween(lastMockDay, day) >= 7)) return day;
  }
  return ymd(t);
}

/** Exam 2 and the last mock get the test rehearsal note. */
export function rehearsal(p: Piece, pieces: Piece[]): boolean {
  const mocks = pieces.filter((x) => x.task.kind === "mock" && x.task.optional !== "setting");
  return p.task.pointer.exam === 2 || mocks[mocks.length - 1]?.id === p.id;
}

export interface Checkpoint { id: string; total: number; target: number; weeks: number; finish: string; bookBy: string; limited: boolean }

/**
 * The week-8 checkpoint: after Official Exam 1, if the total is more than 60 below the target, propose a
 * specific extension instead of carrying on as if on track: two weeks, plus one for every 10 points
 * beyond that, at most eight, and never so late that a retake no longer fits before the hard stop.
 */
export function week8Checkpoint(mocks: MockResult[], s: { target: number; finishDate: string | null; agreedFinish: string | null; bookBy: string; hardStop: string }): Checkpoint | null {
  const m = mocks.find((x) => x.official && x.exam === 1 && x.planWeek === 8 && x.total !== null);
  if (!m || m.total! >= s.target - 60) return null;
  const beyond = s.target - 60 - m.total!;
  let weeks = Math.min(8, 2 + Math.ceil(beyond / 10));
  const base = s.finishDate ?? s.agreedFinish ?? s.bookBy;
  const latest = plusDays(s.hardStop, -4 * 7);          // room for the test and a retake 16+ days later
  let finish = plusDays(base, weeks * 7);
  let limited = false;
  while (finish > latest && weeks > 1) { weeks--; finish = plusDays(base, weeks * 7); limited = true; }
  const bookBy = plusDays(s.bookBy, weeks * 7) > plusDays(s.hardStop, -28) ? plusDays(s.hardStop, -28) : plusDays(s.bookBy, weeks * 7);
  return { id: `checkpoint8:${m.pieceId}`, total: m.total!, target: s.target, weeks, finish, bookBy, limited };
}

/** GMAT Focus scores: the total is 205–805 and ends in 5; each section is 60–90. Anything else is a typo. */
export function scoreProblem(sc: { total: string; quant: string; verbal: string; di: string }, practiceRun = false): string | null {
  const t = sc.total ? Number(sc.total) : null;
  if (!practiceRun || t !== null) {
    if (t === null) return "Enter the total.";
    if (t < 205 || t > 805 || t % 10 !== 5) return `${sc.total} can't be a GMAT Focus total: it's 205–805 and ends in 5 (like 615 or 645).`;
  }
  for (const [k, name] of [["quant", "Quant"], ["verbal", "Verbal"], ["di", "Data Insights"]] as const) {
    const v = sc[k];
    if (!v) return `Enter the ${name} score.`;
    const n = Number(v);
    if (n < 60 || n > 90) return `${name} ${v} isn't possible: sections are 60–90.`;
  }
  return null;
}
