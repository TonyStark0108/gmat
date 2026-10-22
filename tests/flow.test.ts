// The flow zone, and what came from GMAT Club's 12-week plan: the Manhattan chapters, pacing sprints,
// accuracy before the clock.

import { describe, expect, it } from "vitest";
import { difficultyFor, type TopicStat } from "../src/core/adapt";
import { feelReply, hardStreak, listOrder, paceOf, zoneOf } from "../src/core/flow";
import { buildModel } from "../src/core/model";
import { fixedPlan } from "../src/core/planFixes";
import { keysOfTask } from "../src/core/recall";
import { deckFor } from "../src/core/topicDeck";
import { fixtureContent, Log } from "./fixture";
import { realContent } from "./helpers";

const stat = (sets: [number, number][], attempts = sets.reduce((s, x) => s + x[1], 0)): TopicStat => ({
  topic: "percents", section: "quant", attempts, accuracy: sets.length ? sets[sets.length - 1][0] : 0, redoAccuracy: null, inReview: 0, reviewWeight: 0, tags: {},
  sets: sets.map(([accuracy, n], i) => ({ day: `2026-12-0${i + 1}`, accuracy, n })),
});

describe("the flow zone", () => {
  it("stretch when it's harder than your skill, easy when it's below it, flow in between", () => {
    expect(zoneOf(undefined, null)).toBe("new");
    expect(zoneOf(stat([[0.5, 10], [0.55, 10]]), null)).toBe("stretch");
    expect(zoneOf(stat([[0.72, 10], [0.7, 10]]), "hard")).toBe("stretch");        // it felt too hard, and under 75%
    expect(zoneOf(stat([[0.72, 10], [0.75, 10]]), null)).toBe("flow");
    expect(zoneOf(stat([[0.92, 10], [0.95, 10]]), null)).toBe("easy");
    expect(zoneOf(stat([[0.82, 10], [0.84, 10]]), "easy")).toBe("easy");         // it felt too easy at 80%+
    expect(zoneOf(stat([[0.82, 10], [0.84, 10]]), null)).toBe("flow");
  });

  it("the clock follows: untimed until 80%, then a normal pace", () => {
    expect(paceOf("new", undefined)).toBe("untimed");
    expect(paceOf("stretch", stat([[0.5, 10]]))).toBe("untimed");
    expect(paceOf("flow", stat([[0.7, 10], [0.72, 10]]))).toBe("soft");
    expect(paceOf("flow", stat([[0.82, 10], [0.85, 10]]))).toBe("paced");
    expect(paceOf("easy", stat([[0.95, 10]]))).toBe("paced");
  });

  it("the zone picks the list and the difficulty: easier for a stretch, harder when it's easy", () => {
    expect(listOrder("stretch", 8)[0]).toBe("easy");
    expect(listOrder("easy", 3)[0]).toBe("medium");
    expect(listOrder("flow", 1)[0]).toBe("easy");
    expect(difficultyFor(stat([[0.9, 10], [0.9, 10]]), "stretch")).toBe("easy");
    expect(difficultyFor(stat([[0.5, 10]]), "easy")).toBe("hard");
  });

  it("how a set felt moves the zone; two hard ones in a row suggest a breather", () => {
    const C = fixtureContent();
    const log = new Log().at("2026-11-20T10:00", { type: "setup.done" })
      .at("2026-12-05T10:05", { type: "piece.started", piece: "og1#0", mode: "desk" })
      .grid("2026-12-05T10:10", "og1#0", 1, ["a", "b", "c", "a", "e", "a"])
      .at("2026-12-05T10:30", { type: "piece.submitted", piece: "og1#0", wrongOrUnsure: 1, answered: 6 })
      .at("2026-12-05T10:30", { type: "piece.done", piece: "og1#0" });
    expect(buildModel(C, log.events, new Date("2026-12-05T11:00")).adapt.zone("percents")).toBe("new");
    log.at("2026-12-05T10:31", { type: "feel", piece: "og1#0", feel: "hard" });
    const m = buildModel(C, log.events, new Date("2026-12-05T11:00"));
    expect(m.adapt.zone("percents")).toBe("stretch");
    expect(m.adapt.pace("percents")).toBe("untimed");
    expect(hardStreak(m.d, m.today)).toBe(false);
    log.at("2026-12-05T11:30", { type: "feel", piece: "gc1#0", feel: "hard" });
    expect(hardStreak(buildModel(C, log.events, new Date("2026-12-05T12:00")).d, "2026-12-05")).toBe(true);
    expect(feelReply("hard", "percents")).toBe("Noted. Next time percents starts easier, with no clock.");
  });
});

describe.skipIf(!realContent())("from GMAT Club's plan", () => {
  const R = realContent()!;
  const tasks = R ? fixedPlan(R) : [];

  it("every chapter of All the Quant + DI comes in the week its topic first does, before that week's practice", () => {
    const ch = tasks.filter((t) => t.id.startsWith("mh-ch"));
    expect(ch).toHaveLength(31);
    const at = (id: string) => tasks.find((t) => t.id === id)!;
    expect(at("mh-ch01").depends_on).toEqual(["w01-general-01"]);
    expect([at("mh-ch01").plan_week, at("mh-ch03").plan_week, at("mh-ch06").plan_week, at("mh-ch18").plan_week, at("mh-ch30").plan_week]).toEqual([1, 2, 4, 7, 9]);
    for (const c of ch) {
      expect(c.bus_ok && !c.needs_desk, c.id).toBe(true);                                   // reading, on a ride
      for (const dep of c.depends_on) expect(tasks.find((t) => t.id === dep)!.kind, `${c.id} waits for ${dep}`).toMatch(/video|test_prep/);   // only for the week's lead video
      const firstPractice = tasks.findIndex((t) => t.plan_week === c.plan_week && t.section === c.section && !t.id.startsWith("mh-") && t.kind !== "video");
      if (firstPractice !== -1) expect(tasks.indexOf(c), c.id).toBeLessThan(firstPractice);
    }
    const w1 = tasks.filter((t) => t.id.startsWith("mh-ch") && t.plan_week === 1).map((t) => t.id);
    expect(w1).toEqual([...w1].sort());                                                   // in chapter order
  });

  it("pacing sprints: two each for quant, DI and CR in weeks 9–11, each with lists, and the pacing cards come with them", () => {
    const sp = tasks.filter((t) => t.id.startsWith("sprint-"));
    expect(sp).toHaveLength(18);
    for (const t of sp) {
      expect(t.timed && t.pointer.count === 10 && t.pointer.minutes === 20, t.id).toBe(true);
      expect((t.pointer.links as { url: string }[]).every((l) => /^https:\/\/gmatclub\.com\//.test(l.url)), t.id).toBe(true);
      expect(keysOfTask(t, R)).toContain("pacing");
    }
    expect(deckFor("pacing").length).toBeGreaterThanOrEqual(3);
  });
});
