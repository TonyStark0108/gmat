// Milestones, the journey and the progress page (spec: Progress, errors, milestones). Nothing here
// can go backwards: everything counts work done, never dates.

import { addDays, parseYmd, weekStartOf, ymd } from "./calendar";
import type { Content, Section } from "./content";
import type { MockResult } from "./mocks";
import { LEVELS } from "./progress";
import type { Piece } from "./pieces";
import type { ReviewModel } from "./review";
import type { Settings } from "./settings";
import type { Derived } from "./state";
import { buildWeek } from "./week";

export interface Milestone { id: string; name: string; reached: boolean; progress: string | null }

export function milestones(pieces: Piece[], d: Derived, reviews: ReviewModel, mocks: MockResult[], pct: number): Milestone[] {
  const firstTry = (s: ReviewModel["sets"][number]) => {
    const k = s.all.filter((it) => it.firstMark !== "unknown");
    return k.length ? k.filter((it) => it.firstMark === "right").length / k.length : 0;
  };
  const quantBlocks = reviews.sets.filter((s) => s.task.kind === "og_set" && s.section === "quant");
  const diSets = reviews.sets.filter((s) => s.section === "di");
  const ogQuant = pieces.filter((p) => p.task.kind === "og_set" && p.section === "quant");
  const rcDone = pieces.filter((p) => p.task.kind === "rc_section" && d.done.has(p.id)).length;
  const full = mocks.filter((m) => m.official || m.total !== null).length;
  const r = reviews.retired;
  return [
    { id: "mock1", name: "First full mock", reached: full >= 1, progress: null },
    { id: "q90", name: "First quant block over 90%", reached: quantBlocks.some((s) => firstTry(s) > 0.9), progress: null },
    { id: "di80", name: "First DI set over 80%", reached: diSets.some((s) => firstTry(s) > 0.8), progress: null },
    { id: "half", name: "Halfway", reached: pct >= 50, progress: pct < 50 ? `${pct}% so far` : null },
    { id: "ogq", name: "All OG quant done", reached: ogQuant.length > 0 && ogQuant.every((p) => d.done.has(p.id)),
      progress: `${ogQuant.filter((p) => d.done.has(p.id)).length} of ${ogQuant.length} so far` },
    { id: "r100", name: "100 errors retired", reached: r >= 100, progress: r < 100 ? `${r} so far` : null },
    { id: "r200", name: "200 errors retired", reached: r >= 200, progress: r < 200 && r >= 100 ? `${r} so far` : null },
    { id: "rc", name: "Every reading set done", reached: rcDone >= 29, progress: rcDone < 29 ? `${rcDone} so far` : null },
  ];
}

const KIND_WORDS: Record<string, [string, string]> = {
  og_set: ["book block", "book blocks"], rc_section: ["reading set", "reading sets"], cr_set: ["CR set", "CR sets"],
  gmatclub_set: ["GMAT Club set", "GMAT Club sets"], di_set: ["DI set", "DI sets"], video: ["video", "videos"], drill: ["drill", "drills"],
  article: ["article", "articles"], test_prep: ["test-day piece", "test-day pieces"], admin: ["admin step", "admin steps"],
};

/** "Level 4: 3 OG quant blocks, 2 RC sets, Official Practice Exam 1" */
export function whatsLeftFor(level: number, pieces: Piece[], done: Set<string>): string {
  const L = LEVELS.find((x) => x.n === level);
  if (!L) return "";
  if (!L.weeks) return "Your last two fresh official mocks within 10 of your target, the latest not lower.";
  const [a, b] = L.weeks;
  const left = pieces.filter((p) => p.planWeek >= a && p.planWeek <= b && !done.has(p.id) && p.last);
  const mocks = left.filter((p) => p.task.kind === "mock").map((p) => p.task.title ?? "a mock");
  const counts = new Map<string, number>();
  for (const p of left) if (p.task.kind !== "mock") counts.set(p.task.kind, (counts.get(p.task.kind) ?? 0) + 1);
  const bits = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n} ${(KIND_WORDS[k] ?? [k, k])[n === 1 ? 0 : 1]}`);
  const all = [...bits, ...mocks];
  return all.length ? all.join(", ") : "Nothing left.";
}

export const SECTIONS: { s: Section; name: string }[] = [
  { s: "di", name: "DI" }, { s: "quant", name: "Quant" }, { s: "rc", name: "RC" }, { s: "cr", name: "CR" },
];

export function sectionBars(pieces: Piece[], done: Set<string>) {
  return SECTIONS.map(({ s, name }) => {
    const ps = pieces.filter((p) => p.section === s);
    const tot = ps.reduce((n, p) => n + p.minutes, 0);
    const got = ps.reduce((n, p) => n + (done.has(p.id) ? p.minutes : 0), 0);
    return { name, frac: tot ? got / tot : 0 };
  });
}

export function readingSetsLeft(content: Content, pieces: Piece[], done: Set<string>): { left: number; of: number } {
  const of = content.rc_bank.sections.length;
  const used = new Set(pieces.filter((p) => p.task.kind === "rc_section" && done.has(p.id)).map((p) => p.task.pointer.section));
  return { left: of - used.size, of };
}

/** % done at the end of each week since the start, and where the plan expected you to be. */
export function climb(pieces: Piece[], d: Derived, settings: Settings, today: string, busMinutes?: number): { week: string; pct: number | null; expected: number }[] {
  const total = pieces.reduce((s, p) => s + p.minutes, 0) || 1;
  const out: { week: string; pct: number | null; expected: number }[] = [];
  const first = weekStartOf(settings.startDate);
  const assumed = new Set<string>();
  let expectedMin = 0;
  const doneByWeek = [...d.doneAt.entries()].map(([id, x]) => ({ id, w: weekStartOf(x.day) }));
  for (let w = first, i = 0; i < 80; i++, w = ymd(addDays(parseYmd(w), 7))) {
    const plan = buildWeek({ weekStart: w, pieces, done: assumed, settings, busMinutes });
    for (const c of plan.chips) { assumed.add(c.pieceId); expectedMin += pieces.find((p) => p.id === c.pieceId)?.minutes ?? 0; }
    const upto = new Set(doneByWeek.filter((x) => x.w <= w).map((x) => x.id));
    const got = pieces.reduce((s, p) => s + (upto.has(p.id) ? p.minutes : 0), 0);
    out.push({ week: w, pct: w <= today ? Math.floor((100 * got) / total) : null, expected: Math.min(100, Math.round((100 * expectedMin) / total)) });
    if (assumed.size >= pieces.length && w > today) break;
  }
  return out;
}
