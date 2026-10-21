// A piece is one sitting's worth of a task. Big desk tasks are cut at natural break points
// (spec: Pieces, not whole tasks); LSAT RC and CR sets and mocks never are.

import type { Content, Section, Task } from "./content";
import type { Settings } from "./settings";

export type Group = "Q" | "V" | "O"; // quant & DI, verbal, other

export interface Piece {
  id: string;             // "<taskId>#<index>"
  taskId: string;
  task: Task;
  index: number;
  of: number;
  order: number;          // global plan order
  planWeek: number;
  section: Section;
  group: Group;
  minutes: number;
  review: number;
  numbers?: [number, number];
  count?: number;
  deskOnly: boolean;
  busOk: boolean;
  offlineOk: boolean;
  busOnly?: boolean;      // "keep the date, do what fits": reading and CR ride the bus
  last: boolean;
  extra?: boolean;        // outside the plan (top-ups, redos, extra practice): never in % done
}

export function groupOf(section: Section): Group {
  return section === "quant" || section === "di" ? "Q" : section === "rc" || section === "cr" ? "V" : "O";
}

/** Official Practice Exams 3–6 take the plan's later test slots, in this order. */
export const EXAM_SLOTS: Record<number, number> = { 9: 3, 10: 4, 12: 5, 13: 6 };

/**
 * Tasks that count as the plan: every plan task, except the week-1 practice run unless it's switched on.
 * With Exams 3–6 bought, they replace the GMAT Club timed-section stand-ins in weeks 9, 10, 12 and 13
 * (the stand-ins come back if you mark them not bought). A practice run is a non-official timed test
 * unless you choose Official Exam 1 for it.
 */
export function planTasks(content: Content, settings: Settings): Task[] {
  const standIn = content.plan.tasks.find((t) => t.kind === "mock" && t.pointer.type === "timed_sections");
  return content.plan.tasks
    .filter((t) => t.optional !== "setting" || (t.setting === "practice_run_week1" && settings.practiceRun))
    .map((t) => {
      if (t.kind !== "mock") return t;
      const exam = EXAM_SLOTS[t.plan_week];
      if (exam && t.pointer.type === "timed_sections" && settings.exams36 !== "not bought") {
        return { ...t, title: `Official Practice Exam ${exam}, fresh`, pointer: { type: "official_mock", exam, stand_in: t.pointer } };
      }
      if (t.pointer.practice_run && settings.practiceRunKind !== "official" && standIn) {
        return { ...t, title: "Practice run: timed sections (not an official exam)", pointer: { ...standIn.pointer, practice_run: true } };
      }
      return t;
    });
}

function busRules(t: Task, s: Settings): { deskOnly: boolean; busOk: boolean; busOnly?: boolean } {
  let r = { deskOnly: t.needs_desk, busOk: t.bus_ok };
  if (t.bus_switch === "verbal_review_on_bus") {
    r = s.verbalReviewOnBus ? { deskOnly: false, busOk: true } : { deskOnly: true, busOk: false };
  }
  // Well past safe, "do what fits": mocks, DI and quant keep the desk; reading and CR move to the bus.
  if (s.fitMode && (t.section === "rc" || t.section === "cr") && r.busOk) return { deskOnly: false, busOk: true, busOnly: true };
  return r;
}

export function toPieces(tasks: Task[], s: Settings): Piece[] {
  const out: Piece[] = [];
  let order = 0;
  for (const t of tasks) {
    const splits = t.kind === "og_set" || (t.kind === "gmatclub_set" && !t.timed) ? t.break_points ?? null : null;
    const parts = splits && splits.length > 1 ? splits : [null];
    const total = t.pointer.count ?? 0;
    const { deskOnly, busOk, busOnly } = busRules(t, s);
    parts.forEach((bp, i) => {
      let share = 1 / parts.length;
      if (bp?.numbers && total) share = (bp.numbers[1] - bp.numbers[0] + 1) / total;
      else if (bp?.count && total) share = bp.count / total;
      out.push({
        id: `${t.id}#${i}`,
        taskId: t.id,
        task: t,
        index: i,
        of: parts.length,
        order: order++,
        planWeek: t.plan_week,
        section: t.section,
        group: groupOf(t.section),
        minutes: Math.max(1, Math.round(t.est_minutes * share)),
        review: Math.round(t.review_minutes * share),
        numbers: bp?.numbers ?? (t.pointer.numbers ?? undefined) ?? undefined,
        count: bp?.count ?? (bp?.numbers ? bp.numbers[1] - bp.numbers[0] + 1 : t.pointer.count),
        deskOnly,
        busOk,
        offlineOk: t.offline_ok || t.pointer.book === "vr",
        busOnly,
        last: i === parts.length - 1,
      });
    });
  }
  return out;
}

/** Plan minutes a piece takes from a budget: the sitting plus its review later. */
export const load = (p: Piece) => p.minutes + p.review;
