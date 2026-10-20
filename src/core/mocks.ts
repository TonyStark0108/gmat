// Mocks, Ready, booking and the end game (spec: Mock; A finish date, not a test date; The end game).

import { addDays, daysBetween, parseYmd, plusDays, weekStartOf, ymd } from "./calendar";
import type { Piece } from "./pieces";
import type { Derived } from "./state";
import { TARGET } from "./settings";

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

/** Ready: one fresh official mock at 665+, or with Exams 3–6 bought, two fresh ones in a row at 655+. */
export function isReady(mocks: MockResult[], bought: boolean): boolean {
  const fresh = mocks.filter((m) => m.official && m.fresh && !m.practiceRun && m.total !== null);
  if (fresh.some((m) => m.total! >= TARGET)) return true;
  if (bought) for (let i = 1; i < fresh.length; i++) if (fresh[i - 1].total! >= 655 && fresh[i].total! >= 655) return true;
  return false;
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
