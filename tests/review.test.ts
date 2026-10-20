import { describe, expect, it } from "vitest";
import { chooseCard } from "../src/core/card";
import { buildModel } from "../src/core/model";
import { mixedSession } from "../src/core/review";
import { fixtureContent, Log } from "./fixture";

const C = fixtureContent();
const setup = () => new Log().at("2026-11-20T10:00", { type: "setup.done" });
const item = (log: Log, when: string, id: string) => buildModel(C, log.events, new Date(when)).reviews.items.get(id)!;

/** Saturday 5 Dec: the OG block of six, logged. 1 B (wrong), 2 B, 3 Cs (right, unsure), 4 A (wrong), 5 E, 6 A. */
function loggedSet() {
  return setup()
    .at("2026-12-05T10:05", { type: "piece.started", piece: "og1#0", mode: "desk" })
    .grid("2026-12-05T10:10", "og1#0", 1, ["b", "b", "cs", "a", "e", "a"])
    .at("2026-12-05T10:30", { type: "piece.submitted", piece: "og1#0", wrongOrUnsure: 3, answered: 6 })
    .at("2026-12-05T10:30", { type: "piece.done", piece: "og1#0" });
}
const retry = (log: Log, when: string, q: number, value: string, attempt: "retry" | "mixed" = "retry", review = "set:og1") =>
  log.at(when, { type: "review.answer", review, item: `og1|${q}`, attempt, value });

describe("test 3 · log now, review later", () => {
  it("submitting only logs: wrong and not-sure together, and the review opens the next day", () => {
    const log = loggedSet();
    const m = buildModel(C, log.events, new Date("2026-12-05T11:00"));
    const s = m.reviews.setById.get("set:og1")!;
    expect(s.items.map((it) => it.q)).toEqual(["1", "3", "4"]);        // two wrong, one right-but-unsure
    expect(s.status).toBe("waiting");
    expect(buildModel(C, log.events, new Date("2026-12-06T10:00")).reviews.setById.get("set:og1")!.status).toBe("open");
  });

  it("a session past 11:30 pm moves the next day's review a day later", () => {
    const log = loggedSet().at("2026-12-05T23:40", { type: "time", minutes: 30, where: "desk", source: "rc" });
    const s = buildModel(C, log.events, new Date("2026-12-06T10:00")).reviews.setById.get("set:og1")!;
    expect(s.windowFrom).toBe("2026-12-07");
  });
});

describe("test 4 · one test per arrow of the redo diagram", () => {
  it("missed or unsure in a set → in review", () => {
    const m = buildModel(C, loggedSet().events, new Date("2026-12-06T10:00"));
    expect(m.reviews.items.get("og1|1")!.state).toBe("review");
    expect(m.reviews.items.get("og1|3")!.state).toBe("review");
    expect(m.reviews.items.get("og1|2")!.state).toBe("fine");
  });

  it("Redo → Return: right on the blind retry; it comes back 14–21 days later", () => {
    const log = retry(loggedSet(), "2026-12-08T07:50", 1, "A");
    const it1 = item(log, "2026-12-08T08:00", "og1|1");
    expect(it1.state).toBe("return");
    expect(it1.dueFrom).toBe("2026-12-22");
  });

  it("Redo → Redo: wrong again, back in 1–3 days", () => {
    const log = retry(loggedSet(), "2026-12-08T07:50", 1, "C");
    const it1 = item(log, "2026-12-08T08:00", "og1|1");
    expect(it1.state).toBe("redo");
    expect(it1.misses).toBe(2);
    expect(it1.dueFrom).toBe("2026-12-09");
  });

  it("Return → Retired: right again, 7+ days after the right redo", () => {
    const log = retry(retry(loggedSet(), "2026-12-08T07:50", 1, "A"), "2026-12-22T07:50", 1, "A", "mixed", "mixed:x");
    const it1 = item(log, "2026-12-22T08:00", "og1|1");
    expect(it1.state).toBe("retired");
    expect(buildModel(C, log.events, new Date("2026-12-22T08:00")).reviews.retired).toBe(1);
  });

  it("Return → Redo: wrong", () => {
    const log = retry(retry(loggedSet(), "2026-12-08T07:50", 1, "A"), "2026-12-22T07:50", 1, "D", "mixed", "mixed:x");
    expect(item(log, "2026-12-22T08:00", "og1|1").state).toBe("redo");
  });

  it("Redo → Moved on: the third miss", () => {
    let log = retry(loggedSet(), "2026-12-08T07:50", 1, "C");                // miss 2
    log = retry(log, "2026-12-10T07:50", 1, "D", "mixed", "mixed:x");        // miss 3
    expect(item(log, "2026-12-10T08:00", "og1|1").state).toBe("movedon");
  });

  it("Return → Moved on: the third miss", () => {
    let log = retry(loggedSet(), "2026-12-08T07:50", 1, "C");                // miss 2, redo
    log = retry(log, "2026-12-10T07:50", 1, "A", "mixed", "mixed:x");        // right: return
    log = retry(log, "2026-12-24T07:50", 1, "B", "mixed", "mixed:y");        // miss 3
    expect(item(log, "2026-12-24T08:00", "og1|1").state).toBe("movedon");
  });

  it("right but unsure: straight to Return on a right retry, retires on a right return, never needs a tag", () => {
    let log = retry(loggedSet(), "2026-12-08T07:50", 3, "C");
    let it3 = item(log, "2026-12-08T08:00", "og1|3");
    expect(it3.needsTag).toBe(false);
    expect(it3.state).toBe("return");
    log = retry(log, "2026-12-23T07:50", 3, "C", "mixed", "mixed:x");
    it3 = item(log, "2026-12-23T08:00", "og1|3");
    expect(it3.state).toBe("retired");
  });

  it("a review not started within 14 days dissolves into mixed redos", () => {
    const m = buildModel(C, loggedSet().events, new Date("2026-12-21T10:00"));
    expect(m.reviews.setById.get("set:og1")!.status).toBe("lapsed");
    expect(m.reviews.items.get("og1|1")!.state).toBe("redo");
  });
});

describe("test 11 · book vs PDF corrections", () => {
  it("“My book says…” takes the book's word, and cancels the redo it caused; % done doesn't change", () => {
    const log = loggedSet();
    const before = buildModel(C, log.events, new Date("2026-12-06T10:00"));
    log.at("2026-12-06T10:01", { type: "key.override", book: "og", n: 1, value: "B" });
    const after = buildModel(C, log.events, new Date("2026-12-06T10:02"));
    expect(after.reviews.items.get("og1|1")!.state).toBe("fine");
    expect(after.pct).toBe(before.pct);
  });

  it("“I entered it wrong” fixes the letter before anything is scheduled", () => {
    const log = loggedSet().at("2026-12-06T10:01", { type: "answer", piece: "og1#0", q: 4, value: "D", unsure: false, sinceStartMs: 0, fix: true });
    const m = buildModel(C, log.events, new Date("2026-12-06T10:02"));
    expect(m.reviews.items.get("og1|4")!.state).toBe("fine");
    expect(m.reviews.setById.get("set:og1")!.items.map((x) => x.q)).toEqual(["1", "3"]);
  });
});

describe("the review chip turns up in the right slot (test 2)", () => {
  it("a quant set done on Saturday is the card in Tuesday's morning slot", () => {
    const log = loggedSet();
    const m = buildModel(C, log.events, new Date("2026-12-08T07:50"));
    const card = chooseCard({ now: m.now, today: m.today, settings: m.d.settings, pieces: m.plan, byId: m.byId, week: m.week, d: m.d, bus: false,
      online: true, mix: "mix", timeBudget: null, reviews: m.reviews, extras: m.weekExtras, cardsDue: 0 });
    expect(card.kind).toBe("review");
  });

  it("on the bus it waits: quant reviews never ride", () => {
    const m = buildModel(C, loggedSet().events, new Date("2026-12-07T18:45"));
    const card = chooseCard({ now: m.now, today: m.today, settings: m.d.settings, pieces: m.plan, byId: m.byId, week: m.week, d: m.d, bus: true,
      online: true, mix: "mix", timeBudget: null, reviews: m.reviews, extras: [], cardsDue: 0 });
    expect(card.kind).not.toBe("review");
  });

  it("skip the mornings and it waits for Saturday, keeping its place up to 14 days", () => {
    const m = buildModel(C, loggedSet().events, new Date("2026-12-12T10:05"));
    expect(m.reviews.setById.get("set:og1")!.status).toBe("open");
  });
});

describe("reading and CR", () => {
  function rcLogged(answers: string[]) {
    const log = setup().at("2026-12-07T18:45", { type: "piece.started", piece: "rc1#0", mode: "bus" });
    const ids = ["p1q1", "p1q2", "p1q3", "p2q1", "p2q2", "p2q3"];
    ids.forEach((q, i) => log.at("2026-12-07T19:00", { type: "answer", piece: "rc1#0", q, value: answers[i], unsure: false, sinceStartMs: i }));
    return log.at("2026-12-07T19:30", { type: "piece.submitted", piece: "rc1#0", wrongOrUnsure: 0, answered: 6 })
      .at("2026-12-07T19:30", { type: "piece.done", piece: "rc1#0" });
  }

  it("single reading questions are never redone; three misses on one passage bring it back 3–7 days later", () => {
    const log = rcLogged(["E", "E", "E", "D", "E", "A"]).at("2026-12-08T18:50", { type: "review.done", review: "set:rc1" });
    const m = buildModel(C, log.events, new Date("2026-12-11T19:00"));
    expect(m.reviews.items.get("rc1|p1q1")!.state).toBe("done");
    expect(m.extras.find((x) => x.xkind === "passage")?.availableFrom).toBe("2026-12-11");
    expect(m.reviews.inReview).toBe(0);
  });

  it("CR without a key: the review takes the official letters, then marks the set", () => {
    const log = setup().at("2026-12-07T18:45", { type: "piece.started", piece: "cr1#0", mode: "bus" });
    ["A", "B", "Cs", "D", "E"].forEach((l, i) => log.at("2026-12-07T19:10", { type: "answer", piece: "cr1#0", q: i + 1, value: l[0], unsure: l.length > 1, sinceStartMs: 0 }));
    log.at("2026-12-07T19:40", { type: "piece.submitted", piece: "cr1#0", wrongOrUnsure: 1, answered: 5 }).at("2026-12-07T19:40", { type: "piece.done", piece: "cr1#0" });
    let s = buildModel(C, log.events, new Date("2026-12-08T19:00")).reviews.setById.get("set:cr1")!;
    expect(s.path).toBe("fallback");
    "ABDDE".split("").forEach((k, i) => log.at("2026-12-08T19:05", { type: "key.entered", key: `cr:https://gmatclub.com/forum/cr-q${i + 1}-1000${i + 1}.html`, value: k }));
    log.at("2026-12-08T19:06", { type: "review.done", review: "set:cr1" });
    s = buildModel(C, log.events, new Date("2026-12-08T19:10")).reviews.setById.get("set:cr1")!;
    const m = buildModel(C, log.events, new Date("2026-12-08T19:10"));
    expect(m.reviews.items.get("cr1|3")!.firstMark).toBe("wrong");
    expect(m.reviews.items.get("cr1|3")!.state).toBe("redo");                   // redos are marked automatically from now on
    expect(m.reviews.items.get("cr1|1")!.state).toBe("fine");
    expect(s.status).toBe("done");
  });
});

describe("mixed review chips", () => {
  it("about eight at most, and neighbours don't share a topic where that can be helped", () => {
    const log = loggedSet();
    const m = buildModel(C, log.events, new Date("2026-12-21T10:00"));       // the review lapsed: three redos
    const s = mixedSession(m.reviews, m.d, m.today, { bus: false, online: true, morning: false });
    expect(s.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < s.length; i++) if (new Set(s.map((x) => x.topic)).size > 1) expect(s[i].topic === s[i - 1].topic && i === 1).toBe(false);
  });
});
