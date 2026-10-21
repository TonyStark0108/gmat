// The plan audit's corrections (src/core/planFixes.ts), checked against the real plan.

import { describe, expect, it } from "vitest";
import { CJ_SUPPLY, fixedPlan } from "../src/core/planFixes";
import { planTasks, toPieces } from "../src/core/pieces";
import { projectFinish } from "../src/core/week";
import { realContent, settings } from "./helpers";

const R = realContent();

describe.skipIf(!R)("the plan, as corrected", () => {
  const tasks = R ? fixedPlan(R) : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  it("every reading half-set ends at the end of a passage (Verbal Review 124–143 now cuts at 131)", () => {
    for (const t of tasks.filter((x) => x.kind === "og_set" && x.pointer.qtype === "RC" && x.break_points?.length === 2)) {
      const meta = R!.book_keys.books[t.pointer.book ?? "og"].meta as { rc_passage_groups?: [number, number][] };
      const groups = (t.pointer.passage_groups as [number, number][] | undefined) ?? meta.rc_passage_groups ?? [];
      const cut = t.break_points![0].numbers![1];
      expect(groups.some(([, y]) => y === cut), t.id).toBe(true);
    }
    expect(byId.get("w12-rc-01")!.break_points).toEqual([{ numbers: [124, 131] }, { numbers: [132, 143] }]);
  });

  it("a book set waits for the earlier set from the same book, never another book", () => {
    for (const t of tasks.filter((x) => x.kind === "og_set")) {
      for (const dep of t.depends_on) {
        const d = byId.get(dep);
        if (d?.kind === "og_set") expect(d.pointer.book ?? "og", `${t.id} ← ${dep}`).toBe(t.pointer.book ?? "og");
      }
    }
    expect(byId.get("w07-cr-04")!.depends_on).not.toContain("w07-cr-03");
  });

  it("the plan's 'watch this first' videos lead their weeks: week 2, week 11, and week 4's CR", () => {
    const wk = (w: number) => tasks.filter((t) => t.plan_week === w);
    expect(wk(2)[0].id).toBe("w02-general-03");
    expect(wk(11)[0].id).toBe("w11-mock-01");
    for (const t of wk(2).filter((x) => x.id !== "w02-general-03" && !["article", "test_prep", "admin"].includes(x.kind))) expect(t.depends_on, t.id).toContain("w02-general-03");
    for (const t of wk(4).filter((x) => x.section === "cr")) expect(t.depends_on, t.id).toContain("w04-rc-01");
  });

  it("the GMAT with CJ list is never asked for more than it has; the rest come from the plan's lists or the DI Review bank", () => {
    const used: Record<string, number> = {};
    let fallbackGt = 0, fallbackMsr = 0;
    for (const t of tasks.filter((x) => x.kind === "di_set")) {
      const was = R!.plan.tasks.find((x) => x.id === t.id)!;
      const total = (r: typeof t.pointer.recipe) => (r ?? []).reduce((s, x) => s + x.count, 0);
      expect(total(t.pointer.recipe), t.id).toBe(total(was.pointer.recipe));        // the set keeps its size
      for (const r of t.pointer.recipe ?? []) {
        if (/GMAT with CJ/.test(r.source)) for (const ty of r.types ?? []) used[ty] = (used[ty] ?? 0) + r.count / (r.types!.length);
        if (/graphs & tables list/.test(r.source)) { fallbackGt += r.count; expect(r.url).toMatch(/^https:\/\/gmatclub\.com\//); }
        if (/DI Review online bank/.test(r.source)) fallbackMsr += r.count;
      }
    }
    const cj = tasks.filter((x) => x.kind === "di_set").flatMap((t) => t.pointer.recipe ?? []).filter((r) => /GMAT with CJ/.test(r.source)).reduce((s, r) => s + r.count, 0);
    expect(cj).toBeLessThanOrEqual(Object.values(CJ_SUPPLY).reduce((s, n) => s + n, 0));
    expect(fallbackGt).toBeGreaterThan(0);
    expect(fallbackMsr).toBeGreaterThan(0);
  });

  it("with Exams 3–6 bought, weeks 9–13 hold Exams 2–6 in order; the finish date doesn't move", () => {
    const mocks = planTasks(R!, settings()).filter((t) => t.kind === "mock" && t.plan_week >= 8).map((t) => [t.plan_week, t.pointer.exam]);
    expect(mocks).toEqual([[8, 1], [9, 2], [10, 3], [11, 4], [12, 5], [13, 6]]);
    const s = settings();
    const p = projectFinish({ pieces: toPieces(planTasks(R!, s), s), done: new Set(), settings: s, fromWeek: "2026-11-30", fromDay: "2026-12-01" });
    expect(p.finish! >= "2027-06-01" && p.finish! <= "2027-08-15").toBe(true);
  });
});
