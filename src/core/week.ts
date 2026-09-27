// Building a week from the two budgets (spec: The week, How a week is built).
//
// Desk pieces (quant, DS, DI, book sets, drills, GMAT Club sets, mocks) only ever go in desk time.
// Bus-friendly pieces (reading, videos, CR, articles) go to the rides first and may use spare desk time.
// Both streams follow plan order. Desk time sets the pace: rides never take plan work from a plan
// week the desk hasn't reached, so a quiet week of rides can't pull next week's plan forward.

import { addDays, parseYmd, weekCapacity, ymd, type WeekCapacity } from "./calendar";
import { load, type Piece } from "./pieces";
import { WEEK_CAP_MIN, type Settings } from "./settings";

export type Budget = "desk" | "bus";
export interface WeekChip { pieceId: string; budget: Budget; carried: boolean }
export interface WeekPlan {
  weekStart: string;
  chips: WeekChip[];
  cap: WeekCapacity;
  used: { desk: number; bus: number };
  pause: boolean;
  mockDay: string | null;   // the Saturday a mock is planned for
}

const FIT_TOLERANCE = 1.1;   // a piece may run 10% over what's left of a budget

export interface BuildArgs {
  weekStart: string;
  pieces: Piece[];               // the whole plan, in plan order
  done: Set<string>;             // piece ids already done
  settings: Settings;
  busMinutes?: number;           // learned ride length (80 until the app knows)
  fromDay?: string;              // rebuilding mid-week: only days from here on count
  carried?: Set<string>;         // pieces planned in an earlier week and not done
  extraDeskPerWeek?: number;     // for "what would it take" questions
}

export function buildWeek(a: BuildArgs): WeekPlan {
  const cap = weekCapacity(a.weekStart, a.settings, a.busMinutes, a.fromDay);
  if (a.extraDeskPerWeek) {
    const extra = Math.min(a.extraDeskPerWeek, WEEK_CAP_MIN - cap.rawDesk - cap.rawBus);
    cap.desk += Math.max(0, extra) * 0.85;
  }
  const empty: WeekPlan = { weekStart: a.weekStart, chips: [], cap, used: { desk: 0, bus: 0 }, pause: false, mockDay: null };
  if (cap.desk === 0 && cap.bus === 0) return { ...empty, pause: true };

  const remaining = a.pieces.filter((p) => !a.done.has(p.id));
  const chips: WeekChip[] = [];
  let desk = 0, bus = 0;
  const fits = (used: number, capMin: number, need: number) =>
    capMin > 0 && (used === 0 || used + need <= capMin * FIT_TOLERANCE);

  // 1. Desk pieces, in plan order, until the next one doesn't fit.
  let deskFrontier = Infinity;
  for (const p of remaining) {
    if (!p.deskOnly) continue;
    if (!fits(desk, cap.desk, load(p))) {
      deskFrontier = p.planWeek;
      break;
    }
    desk += load(p);
    chips.push({ pieceId: p.id, budget: "desk", carried: !!a.carried?.has(p.id) });
  }

  // 2. Bus-friendly pieces, in plan order, no further ahead than the desk has reached.
  for (const p of remaining) {
    if (p.deskOnly) continue;
    if (p.planWeek > deskFrontier) break;
    const need = load(p);
    if (fits(bus, cap.bus, need)) {
      bus += need;
      chips.push({ pieceId: p.id, budget: "bus", carried: !!a.carried?.has(p.id) });
    } else if (desk + need <= cap.desk * FIT_TOLERANCE) {
      desk += need;          // spare desk time can take a reading or a video
      chips.push({ pieceId: p.id, budget: "desk", carried: !!a.carried?.has(p.id) });
    } else break;
  }

  // Keep plan order on the week screen; carried chips first (spec: Carry-over first).
  const order = new Map(a.pieces.map((p, i) => [p.id, i]));
  chips.sort((x, y) => Number(y.carried) - Number(x.carried) || order.get(x.pieceId)! - order.get(y.pieceId)!);

  const hasMock = chips.some((c) => a.pieces.find((p) => p.id === c.pieceId)?.task.kind === "mock");
  let mockDay: string | null = null;
  if (hasMock) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(parseYmd(a.weekStart), i);
      if (a.settings.saturday.days.includes(d.getDay())) mockDay = ymd(d);
    }
  }
  return { weekStart: a.weekStart, chips, cap, used: { desk, bus }, pause: false, mockDay };
}

export interface Projection { finish: string | null; weeks: number; lastWeekStart: string | null }

/** When would the remaining plan be done at this pace? Simulates week after week. */
export function projectFinish(args: Omit<BuildArgs, "weekStart" | "fromDay"> & { fromWeek: string; fromDay?: string; horizonWeeks?: number }): Projection {
  const done = new Set(args.done);
  const total = args.pieces.filter((p) => !done.has(p.id)).length;
  if (total === 0) return { finish: args.fromDay ?? args.fromWeek, weeks: 0, lastWeekStart: args.fromWeek };
  let week = args.fromWeek;
  for (let i = 0; i < (args.horizonWeeks ?? 104); i++) {
    const plan = buildWeek({ ...args, weekStart: week, done, fromDay: i === 0 ? args.fromDay : undefined });
    plan.chips.forEach((c) => done.add(c.pieceId));
    if (args.pieces.every((p) => done.has(p.id))) {
      return { finish: lastWorkDay(week, args.settings), weeks: i + 1, lastWeekStart: week };
    }
    week = ymd(addDays(parseYmd(week), 7));
  }
  return { finish: null, weeks: Infinity, lastWeekStart: null };
}

function lastWorkDay(weekStart: string, s: Settings): string {
  // the Saturday block if there is one, otherwise the week's Sunday
  for (let i = 6; i >= 0; i--) {
    const d = addDays(parseYmd(weekStart), i);
    if (s.saturday.enabled && s.saturday.days.includes(d.getDay())) return ymd(d);
  }
  return ymd(addDays(parseYmd(weekStart), 6));
}

/**
 * Finish date and hours are linked (spec: Your dates). For a finish date you pick, how many
 * extra desk minutes a week would it take? In steps of one morning slot; never past 15 hours.
 */
export function extraDeskFor(target: string, args: Omit<BuildArgs, "weekStart" | "fromDay"> & { fromWeek: string; fromDay?: string }, step = 45): { extraPerWeek: number } | null {
  for (let extra = 0; extra <= WEEK_CAP_MIN; extra += step) {
    const p = projectFinish({ ...args, extraDeskPerWeek: extra });
    if (p.finish && p.finish <= target) return { extraPerWeek: extra };
  }
  return null;
}
