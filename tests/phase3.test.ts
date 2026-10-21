import { describe, expect, it } from "vitest";
import { difficultyFor, topupOffers, type TopicStat } from "../src/core/adapt";
import { busChip, rideMinutes } from "../src/core/bus";
import { buildCards, introduceThisWeek, sessionCards } from "../src/core/cards";
import { dateCheck, keepDatePlan, lifeRange, skippedOut, askLetGo } from "../src/core/life";
import { crReplacement } from "../src/core/links";
import { bookingCard, endPhase, isReady, moveMockDay, type MockResult } from "../src/core/mocks";
import { buildModel } from "../src/core/model";
import { mockVerdict } from "../src/core/results";
import { sundayLines } from "../src/core/sunday";
import { derive } from "../src/core/state";
import { WEEK_CAP_MIN } from "../src/core/settings";
import { quantTopic } from "../src/core/topics";
import { fixtureContent, Log } from "./fixture";
import { settings, task } from "./helpers";

const C = fixtureContent();

describe("test 7 · each mock is judged against its own week's gap below YOUR target (audit A1)", () => {
  it("50 points at week 8, 20–30 at week 11, measured from 685", () => {
    expect(mockVerdict(C, 8, 635, 685).onTrack).toBe(true);     // 50 below 685
    expect(mockVerdict(C, 8, 625, 685).onTrack).toBe(false);
    expect(mockVerdict(C, 11, 655, 685).onTrack).toBe(true);    // 30 below
    expect(mockVerdict(C, 11, 645, 685).onTrack).toBe(false);
    expect(mockVerdict(C, 8, 690, 685).line).toMatch(/At or above your target of 685/);
    expect(mockVerdict(C, 8, 615, 665).onTrack).toBe(true);     // the same rule at another target
  });
});

describe("test 8 · the booking card", () => {
  const mock = (total: number, fresh = true, exam = 1): MockResult => ({ pieceId: `m${exam}`, exam, official: true, practiceRun: false, fresh, planWeek: 8, day: "2027-02-01", total, quant: null, verbal: null, di: null });
  it("Ready (audit A2): the last two fresh official mocks both within 10 of the target, the latest not lower", () => {
    expect(isReady([mock(700)], 685)).toBe(false);                                   // one good mock isn't enough
    expect(isReady([mock(675), mock(680, true, 2)], 685)).toBe(true);
    expect(isReady([mock(690), mock(680, true, 2)], 685)).toBe(false);               // the latest went down
    expect(isReady([mock(665), mock(690, true, 2)], 685)).toBe(false);               // the first was more than 10 below
    expect(isReady([mock(680), mock(690, false, 1)], 685)).toBe(false);              // a retake isn't fresh
    expect(isReady([mock(680), mock(690, true, 2), mock(660, true, 3)], 685)).toBe(false);  // recomputed: the newest pair counts
  });
  it("appears at Ready, or at the book-by date; “Not yet” hides it for two weeks", () => {
    const log = new Log().at("2026-11-20T10:00", { type: "setup.done" });
    const d0 = derive(log.events);
    expect(bookingCard(d0, false, "2027-03-01")).toBeNull();
    expect(bookingCard(d0, true, "2027-03-01")?.why).toBe("ready");
    expect(bookingCard(d0, false, "2027-07-01")?.why).toBe("bookby");
    log.at("2027-07-01T10:00", { type: "booking", answer: "notyet" });
    expect(bookingCard(derive(log.events), false, "2027-07-10")).toBeNull();
    expect(bookingCard(derive(log.events), false, "2027-07-16")?.why).toBe("bookby");
  });
  it("at the book-by date it suggests a date that leaves room for a retake before the hard stop", () => {
    // 3–4 weeks out would pass the hard stop's retake room, so it suggests the latest date that keeps it
    const c = bookingCard(derive([]), false, "2027-07-10")!;
    expect(c.suggest).toBe("2027-08-01");                    // hard stop 31 Aug, minus 30 days
    expect(bookingCard(derive([]), false, "2027-07-25")!.suggest).toBe("2027-08-08");   // never sooner than two weeks out
    expect(bookingCard(derive([]), false, "2027-07-01")!.suggest).toBe("2027-07-26");
  });
});

describe("the end game counts back from a booked test", () => {
  it("taper, test week, the checklist, cards only, the day before, test day", () => {
    const t = "2027-07-23";   // a Friday
    expect(endPhase(t, "2027-07-01")).toBe("plan");
    expect(endPhase(t, "2027-07-12")).toBe("taper");
    expect(endPhase(t, "2027-07-19")).toBe("testweek");
    expect(endPhase(t, "2027-07-20")).toBe("checklist");
    expect(endPhase(t, "2027-07-21")).toBe("cardsonly");
    expect(endPhase(t, "2027-07-22")).toBe("daybefore");
    expect(endPhase(t, t)).toBe("testday");
    expect(endPhase(t, "2027-07-24")).toBe("after");
  });
  it("a moved mock goes to the next free weekend day, at least 7 days after the last one", () => {
    expect(moveMockDay("2027-02-06", null)).toBe("2027-02-07");          // Saturday → Sunday
    expect(moveMockDay("2027-02-06", "2027-02-01")).toBe("2027-02-13");  // not within 7 days of the last
  });
});

describe("test 10 · the date check", () => {
  it("safe, at risk (keep the date with more desk time), or well past safe", () => {
    expect(dateCheck("2027-07-01", "2027-07-10", 0).result).toBe("safe");
    expect(dateCheck("2027-07-20", "2027-07-10", 45).result).toBe("risk");
    expect(dateCheck("2027-09-20", "2027-07-10", null).result).toBe("past");
  });
  it("keeping the date is offered as slots, mornings first, and never past 15 hours a week", () => {
    const p = keepDatePlan(settings(), 45)!;
    expect(p.words).toBe("one more morning (Monday)");
    const big = keepDatePlan(settings(), 300)!;
    expect(big.words).toMatch(/Sunday 10:00–14:00/);
    const s = { ...settings(), ...big.patch };
    const desk = 240 * s.saturday.days.length + 45 * s.mornings.days.length;
    expect(desk).toBeLessThanOrEqual(WEEK_CAP_MIN);
  });
  it("something came up: tonight, this weekend, a whole week", () => {
    expect(lifeRange("tonight", "2026-12-09")).toEqual({ from: "2026-12-09", to: "2026-12-09" });
    expect(lifeRange("weekend", "2026-12-09")).toEqual({ from: "2026-12-12", to: "2026-12-13" });
    expect(lifeRange("weekend", "2026-12-13")).toEqual({ from: "2026-12-13", to: "2026-12-13" });
    expect(lifeRange("week", "2026-12-09")).toEqual({ from: "2026-12-09", to: "2026-12-13" });
    expect(lifeRange("week", "2026-12-09", "2026-12-14")).toEqual({ from: "2026-12-14", to: "2026-12-20" });
  });
});

describe("skips", () => {
  it("the same task skipped three times in a week moves to next week; skipped in three weeks, it asks once", () => {
    const log = new Log();
    for (const d of ["2026-12-07", "2026-12-08", "2026-12-09"]) log.at(`${d}T19:00`, { type: "skip", piece: "og1#0" });
    expect(skippedOut(derive(log.events), "og1#0", "2026-12-07")).toBe(true);
    expect(askLetGo(derive(log.events), () => "og1")).toBeNull();
    log.at("2026-12-15T19:00", { type: "skip", piece: "og1#0" }).at("2026-12-22T19:00", { type: "skip", piece: "og1#0" });
    expect(askLetGo(derive(log.events), () => "og1")).toBe("og1");
    log.at("2026-12-22T19:01", { type: "letgo", task: "og1", keep: true });
    expect(askLetGo(derive(log.events), () => "og1")).toBeNull();
  });
});

describe("flashcards", () => {
  it("about 15 new starter cards a week, and none when cards pile up", () => {
    expect(introduceThisWeek(C, derive([]), 0)).toHaveLength(15);
    expect(introduceThisWeek(C, derive([]), 31)).toHaveLength(0);
  });
  it("a session is 10–15 cards; Again brings a card back sooner than Got it", () => {
    const log = new Log().at("2026-12-01T08:00", { type: "cards.introduced", week: "2026-11-30", ids: introduceThisWeek(C, derive([]), 0) });
    const now = new Date("2026-12-01T19:00").getTime();
    const s = sessionCards(buildCards(C, derive(log.events)), now);
    expect(s.length).toBeGreaterThanOrEqual(10);
    expect(s.length).toBeLessThanOrEqual(15);
    log.at("2026-12-01T19:01", { type: "card.rated", card: s[0].id, rating: "again" }).at("2026-12-01T19:01", { type: "card.rated", card: s[1].id, rating: "good" })
      .at("2026-12-01T19:20", { type: "card.rated", card: s[1].id, rating: "good" });
    const cs = buildCards(C, derive(log.events));
    expect(cs.find((c) => c.id === s[0].id)!.due).toBeLessThan(cs.find((c) => c.id === s[1].id)!.due);
  });
  it("once booked, nothing comes back after test day", () => {
    const log = new Log().at("2026-12-01T08:00", { type: "cards.introduced", week: "2026-11-30", ids: ["qf1"] });
    for (let i = 0; i < 6; i++) log.at(`2026-12-0${i + 2}T19:00`, { type: "card.rated", card: "qf1", rating: "good" });
    log.at("2026-12-09T19:00", { type: "booking", answer: "booked", date: "2026-12-20" });
    const c = buildCards(C, derive(log.events)).find((x) => x.id === "qf1")!;
    expect(c.due).toBeLessThanOrEqual(new Date("2026-12-20T00:00").getTime());
  });
  it("your lines become cards: “DS · number properties · process” on the front", () => {
    const log = new Log().at("2026-12-08T08:00", { type: "line", source: "review:x", text: "Test both cases of x", front: "DS · number properties · process" });
    const c = buildCards(C, derive(log.events)).find((x) => x.source === "error")!;
    expect(c.front).toBe("DS · number properties · process");
    expect(c.back).toBe("Test both cases of x");
  });
});

describe("bus mode learns your rides, and only suggests", () => {
  const rides = (log: Log, days: string[], at = "18:40", minutes = 70) => {
    for (const d of days) {
      const on = new Date(`${d}T${at}`);
      log.at(on.toISOString(), { type: "bus", on: true });
      log.at(new Date(on.getTime() + minutes * 60_000).toISOString(), { type: "bus", on: false });
    }
    return log;
  };
  it("80 minutes until there are three rides, then the typical one", () => {
    expect(rideMinutes(derive([]), Date.now())).toBe(80);
    const log = rides(new Log(), ["2026-12-07", "2026-12-08", "2026-12-09"]);
    expect(rideMinutes(derive(log.events), new Date("2026-12-10T12:00").getTime())).toBe(70);
  });
  it("“On the bus?” around the times you usually tap Bus, and not at other times", () => {
    const log = rides(new Log(), ["2026-12-07", "2026-12-08", "2026-12-09"]);
    expect(busChip(derive(log.events), new Date("2026-12-10T18:50"))).toBe(true);
    expect(busChip(derive(log.events), new Date("2026-12-10T14:00"))).toBe(false);
  });
});

describe("top-ups and difficulty", () => {
  it("easy lists under 70%, medium by default, hard after two sets at 80%+", () => {
    const st = (accuracy: number, sets: number[]): TopicStat => ({ topic: "rates", section: "quant", attempts: 20, accuracy, redoAccuracy: null, inReview: 0, reviewWeight: 0, tags: {}, sets: sets.map((a) => ({ day: "x", accuracy: a, n: 10 })) });
    expect(difficultyFor(undefined)).toBe("medium");
    expect(difficultyFor(st(0.6, [0.6]))).toBe("easy");
    expect(difficultyFor(st(0.78, [0.7, 0.8]))).toBe("medium");
    expect(difficultyFor(st(0.85, [0.82, 0.86]))).toBe("hard");
  });
  it("a rough set with concept tags offers a top-up; mostly careless offers none; never more than two a week", () => {
    const log = new Log().at("2026-11-20T10:00", { type: "setup.done" })
      .at("2026-12-05T10:05", { type: "piece.started", piece: "og1#0", mode: "desk" })
      .grid("2026-12-05T10:10", "og1#0", 1, ["b", "c", "d", "e", "a", "a"])
      .at("2026-12-05T10:30", { type: "piece.submitted", piece: "og1#0", wrongOrUnsure: 5, answered: 6 });
    const tag = (t: "concept" | "careless") => { const l = new Log(); l.events = [...log.events]; for (const q of [1, 2, 3, 4, 5]) l.at("2026-12-08T08:00", { type: "review.tag", item: `og1|${q}`, tag: t }); return l; };
    const m1 = buildModel(C, tag("concept").events, new Date("2026-12-08T08:10"));
    const offers = topupOffers(m1.reviews.setById.get("set:og1")!.all, m1.reviews, { thisWeek: 0, resting: new Map(), count: () => 0 });
    expect(offers.map((o) => o.topic).sort()).toEqual(["percents", "statistics"]);
    const m2 = buildModel(C, tag("careless").events, new Date("2026-12-08T08:10"));
    expect(topupOffers(m2.reviews.setById.get("set:og1")!.all, m2.reviews, { thisWeek: 0, resting: new Map(), count: () => 0 })).toEqual([]);
    expect(topupOffers(m1.reviews.setById.get("set:og1")!.all, m1.reviews, { thisWeek: 2, resting: new Map(), count: () => 0 })).toEqual([]);
  });
  it("the book's concept labels map onto the plan's topics", () => {
    expect(quantTopic("Applied Problems; Percents")).toBe("percents");
    expect(quantTopic("Rate Problem")).toBe("rates");
    expect(quantTopic("Elementary Combinatorics")).toBe("combinations & permutations");
    expect(quantTopic("Properties of Integers")).toBe("number properties");
    expect(quantTopic("Second-Degree Equations")).toBe("algebra");
  });
});

describe("drills: repeat until you hit the target, four goes at most", () => {
  const drill = task({ id: "dr1", section: "quant", kind: "drill", plan_week: 1, est_minutes: 15, pointer: { type: "worksheet", url: "https://example.org/sheet" } });
  drill.target = { accuracy: 1, count: 10, minutes: 15 };
  const CD = fixtureContent([drill]);
  it("a missed target brings it back the next day; after four goes it stops", () => {
    const log = new Log().at("2026-11-20T10:00", { type: "setup.done" });
    log.at("2026-12-08T07:50", { type: "drill", piece: "dr1#0", go: 1, right: 8, total: 10, seconds: 700, met: false }).at("2026-12-08T08:05", { type: "piece.done", piece: "dr1#0" });
    let m = buildModel(CD, log.events, new Date("2026-12-09T07:50"));
    const r = m.extras.find((x) => x.xkind === "drill")!;
    expect(r.id).toBe("x:drill:dr1:2#0");
    expect(r.availableFrom).toBe("2026-12-09");
    for (const go of [2, 3, 4]) log.at(`2026-12-${8 + go}T07:50`, { type: "drill", piece: `x:drill:dr1:${go}#0`, go, right: 9, total: 10, seconds: 700, met: false });
    m = buildModel(CD, log.events, new Date("2026-12-13T07:50"));
    expect(m.extras.some((x) => x.xkind === "drill")).toBe(false);
    // only the first go counts toward % done
    expect(m.plan.some((p) => p.id.startsWith("x:"))).toBe(false);
  });
});

describe("links", () => {
  it("a CR question that won't load is swapped for the next unused reserve question; the app never builds an address", () => {
    expect(crReplacement(C, derive([]))).toBe("https://gmatclub.com/forum/reserve-1-20001.html");
    const log = new Log().at("2026-12-08T19:00", { type: "cr.swap", set: "c1", n: 2, url: "https://gmatclub.com/forum/reserve-1-20001.html" });
    expect(crReplacement(C, derive(log.events))).toBe("https://gmatclub.com/forum/reserve-2-20002.html");
  });
});

describe("the Sunday note", () => {
  const base = { weekStart: "2026-12-07", weekNumber: 2, minutes: 660, retiredThisWeek: 9, chipsMoved: 0, nextShape: "Next week's shape: DI doubles.", purchaseDue: null, deadLinks: 1, leans: "Next week leans DI.", level: null, morningsSkipped: false };
  it("a week that counted, and one that didn't, in its own words", () => {
    expect(sundayLines({ ...base, counted: true })[0]).toBe("Week 2 is done. 11 hours banked. Nine errors retired.");
    const closed = sundayLines({ ...base, counted: false, chipsMoved: 3 });
    expect(closed[0]).toBe("Week 2 is closed. 11 hours banked. Three chips moved to next week.");
    expect(closed.join(" ")).not.toMatch(/not done|missed|behind|overdue/i);
    expect(closed).toContain("One broken link was swapped out.");
  });
});
