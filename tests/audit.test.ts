// One test (or more) per item of the 21 Oct 2026 audit list.

import { describe, expect, it } from "vitest";
import { chooseCard } from "../src/core/card";
import { buildModel, cardContext, upkeep } from "../src/core/model";
import { scoreProblem, week8Checkpoint, type MockResult } from "../src/core/mocks";
import { planTasks, toPieces } from "../src/core/pieces";
import { derive } from "../src/core/state";
import { weekCounts, weekEvents, weekPlanOf } from "../src/core/weekly";
import type { Task } from "../src/core/content";
import { fixtureContent, Log } from "./fixture";
import { settings, task } from "./helpers";

const C = fixtureContent();
const setup = () => new Log().at("2026-11-20T10:00", { type: "setup.done" });

describe("A · target and readiness", () => {
  it("A1: the target is a setting, 685 by default", () => {
    expect(settings().target).toBe(685);
    expect(derive(setup().at("2026-11-21T10:00", { type: "settings", patch: { target: 705 } }).events).settings.target).toBe(705);
  });

  it("A2: Ready is recomputed from the mocks, never stored: a later lower mock takes it away", () => {
    const mocks = (...t: number[]) => {
      const tasks = t.map((_, i) => task({ id: `mk${i}`, section: "mock", kind: "mock", plan_week: 8 + i, pointer: { type: "official_mock", exam: i + 1 } }));
      const log = setup();
      t.forEach((total, i) => log.at(`2027-0${3 + i}-06T13:00`, { type: "outside", piece: `mk${i}#0`, scores: { total, quant: 80, verbal: 85, di: 80 } }).at(`2027-0${3 + i}-06T13:01`, { type: "piece.done", piece: `mk${i}#0` }));
      return buildModel(fixtureContent(tasks), log.events, new Date("2027-07-01T10:00"));
    };
    expect(mocks(680, 685).ready).toBe(true);
    expect(mocks(680, 685).level).toBe(7);
    const after = mocks(680, 685, 650);
    expect(after.ready).toBe(false);
    expect(after.level).toBeLessThan(7);
    expect(after.d.level).toBeLessThan(7);                 // never written down
  });

  it("A3: mock scores must be real GMAT Focus scores", () => {
    expect(scoreProblem({ total: "640", quant: "80", verbal: "82", di: "78" })).toMatch(/ends in 5/);
    expect(scoreProblem({ total: "905", quant: "80", verbal: "82", di: "78" })).toMatch(/205–805/);
    expect(scoreProblem({ total: "645", quant: "95", verbal: "82", di: "78" })).toMatch(/Quant 95 isn't possible/);
    expect(scoreProblem({ total: "645", quant: "80", verbal: "", di: "78" })).toMatch(/Enter the Verbal score/);
    expect(scoreProblem({ total: "645", quant: "80", verbal: "82", di: "78" })).toBeNull();
    expect(scoreProblem({ total: "", quant: "75", verbal: "80", di: "72" }, true)).toBeNull();   // a practice run needs no total
  });

  it("A4: Exam 1 more than 60 below the target proposes a specific extension", () => {
    const m: MockResult = { pieceId: "w08#0", exam: 1, official: true, practiceRun: false, fresh: true, planWeek: 8, day: "2027-04-17", total: 595, quant: 76, verbal: 84, di: 76 };
    const s = { target: 685, finishDate: null, agreedFinish: "2027-07-10", bookBy: "2027-07-01", hardStop: "2027-08-31" };
    const cp = week8Checkpoint([m], s)!;
    expect(cp.weeks).toBeGreaterThanOrEqual(2);
    expect(cp.finish > s.agreedFinish).toBe(true);
    expect(cp.finish <= "2027-08-03").toBe(true);                    // a retake still fits before the 31 Aug hard stop
    expect(week8Checkpoint([{ ...m, total: 635 }], s)).toBeNull();   // within 60: carry on
  });
});

describe("B · official mocks and question supply", () => {
  const timed = (week: number): Task => task({ id: `w${week}-mock`, section: "mock", kind: "mock", plan_week: week, pointer: { type: "timed_sections" } });
  const practice = { ...task({ id: "w01-mock-01", section: "mock", kind: "mock", plan_week: 1, pointer: { type: "official_mock", exam: 1, practice_run: true } }), optional: "setting" as const, setting: "practice_run_week1" };
  const CM = fixtureContent([timed(9), timed(10), timed(11), timed(12), timed(13), practice]);

  it("B5: Exams 3–6 take weeks 9, 10, 12 and 13; the stand-ins come back only if they're not bought", () => {
    const exams = planTasks(CM, settings()).filter((t) => t.kind === "mock").map((t) => [t.plan_week, t.pointer.type, t.pointer.exam]);
    expect(exams).toEqual([[9, "official_mock", 3], [10, "official_mock", 4], [11, "timed_sections", undefined], [12, "official_mock", 5], [13, "official_mock", 6]]);
    expect(planTasks(CM, settings({ exams36: "not bought" })).filter((t) => t.pointer.type === "official_mock")).toHaveLength(0);
  });

  it("C14: the practice run is a non-official test unless you choose Exam 1", () => {
    const run = (k: "official" | "unofficial") => planTasks(CM, settings({ practiceRun: true, practiceRunKind: k })).find((t) => t.id === "w01-mock-01")!;
    expect(run("unofficial").pointer.type).toBe("timed_sections");
    expect(run("official").pointer.type).toBe("official_mock");
  });

  it("B6: a question logged from an online bank joins the error log, the redo ladder and the topic stats", () => {
    const log = setup()
      .at("2026-12-09T08:00", { type: "qlog", source: "dir_online", qtype: "TA", result: "wrong", unsure: false, seconds: 190, ref: "#212" })
      .at("2026-12-09T08:05", { type: "qlog", source: "og_online", qtype: "PS", topic: "rates", result: "right", unsure: true, seconds: 95 });
    const m = buildModel(C, log.events, new Date("2026-12-10T08:00"));
    const items = [...m.reviews.items.values()].filter((it) => it.source === "log");
    expect(items.map((it) => [it.topic, it.state, it.label])).toEqual([["table analysis", "redo", "DI Review online bank, #212"], ["rates", "redo", "OG online question bank"]]);
    expect(items[0].firstMs).toBe(190_000);
    expect(m.adapt.stats.get("table analysis")?.attempts).toBe(1);
  });

  it("B7: DI sets count by question type; any link, or a note, can be sent in", () => {
    const di = { ...task({ id: "di9", section: "di", kind: "di_set", plan_week: 1, pointer: { type: "stand_in", types: ["GI", "TA"] } }) };
    const log = setup()
      .at("2026-12-09T08:00", { type: "outside", piece: "di9#0", right: 3, wrong: 2, unsure: 0, byType: { GI: { right: 2, wrong: 0, unsure: 0 }, TA: { right: 1, wrong: 2, unsure: 0 } } })
      .at("2026-12-09T08:01", { type: "piece.done", piece: "di9#0" })
      .at("2026-12-09T08:02", { type: "shared", url: "https://www.gmatwithcj.com/q/14", set: null, topic: "table analysis", section: "di" })
      .at("2026-12-09T08:03", { type: "shared", url: "", note: "Starter Kit DI #14", set: null, topic: null, section: "di" });
    const m = buildModel(fixtureContent([di]), log.events, new Date("2026-12-10T08:00"));
    expect(m.adapt.stats.get("graphics interpretation")?.accuracy).toBe(1);
    expect(m.adapt.stats.get("table analysis")?.attempts).toBe(3);
    const shared = [...m.reviews.items.values()].filter((it) => it.source === "share").map((it) => it.label);
    expect(shared).toEqual(["The question you sent in (gmatwithcj.com)", "Your note: Starter Kit DI #14"]);
  });

  it("B8: from plan week 8, extra practice uses the harder lists you've pasted in", () => {
    const gc8: Task = { ...task({ id: "gc8", section: "quant", kind: "gmatclub_set", plan_week: 8, est_minutes: 30 }), topic: "percents", pointer: { type: "gmatclub_list", lists: { medium: "https://gmatclub.com/forum/search.php?pct-medium" }, count: 10 } };
    const log = setup().at("2026-11-21T10:00", { type: "settings", patch: { hardLists: { percents: { mid: "https://gmatclub.com/forum/search.php?pct-655", top: "https://gmatclub.com/forum/search.php?pct-705" } } } })
      .at("2026-12-07T08:00", { type: "week.built", week: "2026-12-07", chips: [{ pieceId: "gc8#0", budget: "desk", carried: false }], mockDay: null, key: "x" });
    const m = buildModel(fixtureContent([gc8]), log.events, new Date("2026-12-07T09:00"));
    const urls = (m.adapt.extraChip("2026-12-07")?.open as { urls: { url: string }[] }).urls.map((u) => u.url);
    expect(urls[0]).toBe("https://gmatclub.com/forum/search.php?pct-655");
  });
});

describe("C · pace and honesty about time", () => {
  it("C12: a week is sized from Monday even when the app first opens on Thursday", () => {
    const plan = toPieces(C.plan.tasks, settings());
    const d = derive(setup().events);
    const thu = weekEvents(plan, d, d.settings, "2026-12-10")[0] as { chips: unknown[] };
    const mon = weekEvents(plan, d, d.settings, "2026-12-07")[0] as { chips: unknown[] };
    expect(thu.chips.length).toBe(mon.chips.length);
  });

  it("C12: the date check runs at the start of every week, including weeks the app was never opened", () => {
    const m = buildModel(C, setup().events, new Date("2026-12-21T19:00"));       // never opened in the weeks before
    expect(upkeep(m).some((e) => e.type === "datecheck")).toBe(true);
  });

  it("C13: a week counts on its work, without a rest day", () => {
    const plan = toPieces(C.plan.tasks, settings());
    const log = setup();
    const d0 = derive(log.events);
    const built = weekEvents(plan, d0, d0.settings, "2026-12-07")[0];
    log.at("2026-12-07T08:00", built);
    for (const c of (built as { chips: { pieceId: string }[] }).chips) log.at("2026-12-08T19:00", { type: "piece.done", piece: c.pieceId }).at("2026-12-08T19:00", { type: "time", minutes: 60, where: "desk", source: "x" });
    for (const day of ["2026-12-07", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12"]) log.at(`${day}T19:00`, { type: "time", minutes: 60, where: "desk", source: "x" });
    const d = derive(log.events);
    expect(weekCounts(weekPlanOf(d, "2026-12-07", d.settings)!, d, "2026-12-13", true)).toBe(true);
  });

  it("C11: with the week's work done, the card offers next week's first task", () => {
    const plan = toPieces(C.plan.tasks, settings());
    const log = setup();
    const d0 = derive(log.events);
    log.at("2026-12-07T08:00", { type: "week.built", week: "2026-12-07", chips: [{ pieceId: plan[0].id, budget: "desk", carried: false }], mockDay: null, key: "x" });
    log.at("2026-12-07T09:00", { type: "piece.done", piece: plan[0].id });
    void d0;
    const m = buildModel(C, log.events, new Date("2026-12-09T19:00"));
    const card = chooseCard(cardContext(m, { bus: false, online: true }).ctx);
    expect(card.kind).toBe("task");
    expect((card as { ahead?: boolean }).ahead).toBe(true);
  });
});

describe("E · offline and data safety", () => {
  it("E20: on the bus with no signal, the card skips what needs signal and offers what works offline", () => {
    const log = setup();
    const m0 = buildModel(C, log.events, new Date("2026-12-07T08:00"));
    const plan = m0.plan;
    const video = plan.find((p) => p.task.kind === "video")!, rc = plan.find((p) => p.task.kind === "rc_section")!;
    log.at("2026-12-07T08:00", { type: "week.built", week: "2026-12-07", chips: [video, rc].map((p) => ({ pieceId: p.id, budget: "bus" as const, carried: false })), mockDay: null, key: "x" });
    const m = buildModel(C, log.events, new Date("2026-12-08T18:45"), false);
    const card = chooseCard(cardContext(m, { bus: true, online: false }).ctx);
    expect(card.kind === "task" && card.piece.id).toBe(rc.id);
  });

  it("E21: a restore keeps every week's plan and rebuilds only the current one around the merged answers", () => {
    const log = setup()
      .at("2026-12-01T08:00", { type: "week.built", week: "2026-11-30", chips: [{ pieceId: "og1#0", budget: "desk", carried: false }], mockDay: null, key: "k" })
      .at("2026-12-08T08:00", { type: "restored", added: 12 });
    const d = derive(log.events);
    expect(d.weeks.has("2026-11-30")).toBe(true);
    expect(d.restoredAt).not.toBeNull();
  });
});

describe("E21 · after a restore, the current week keeps only this week's finished work", () => {
  it("a chip finished last week on the other device isn't counted as done this week", () => {
    const plan = toPieces(C.plan.tasks, settings());
    const log = setup()
      .at("2026-12-05T10:30", { type: "piece.done", piece: plan[0].id })                     // last week, on the other laptop
      .at("2026-12-07T21:00", { type: "week.built", week: "2026-12-07", chips: [{ pieceId: plan[0].id, budget: "desk", carried: false }], mockDay: null, key: "old" })
      .at("2026-12-07T21:05", { type: "restored", added: 40 });
    const d = derive(log.events);
    const out = weekEvents(plan, d, d.settings, "2026-12-07")[0] as { chips: { pieceId: string }[] };
    expect(out.chips.some((c) => c.pieceId === plan[0].id)).toBe(false);
  });
});
