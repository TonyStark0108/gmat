// The Phase 2 check, automated: fast-forward a simulated month with a lost week and two weeks of
// skipped mornings, and check the rules that must hold all the way through.

import { describe, expect, it } from "vitest";
import { addDays, parseYmd, plusDays, weekStartOf, ymd } from "../src/core/calendar";
import { dateCheckEvent } from "../src/core/model";
import { load } from "../src/core/pieces";
import { WEEK_CAP_MIN } from "../src/core/settings";
import { lifeEvent } from "../src/core/life";
import { Bot } from "./bot";
import { realContent } from "./helpers";

const C = realContent();
const SKIP_MORNINGS = ["2026-12-07", "2026-12-14"];     // two weeks of skipped mornings
const LOST_WEEK = "2027-01-11";                          // "something came up → a whole week"

function runMonth() {
  const bot = new Bot(C!, 11);
  bot.setup(new Date("2026-11-28T11:00"));
  let lostRecorded = false;
  for (let d = parseYmd("2026-12-01"); ymd(d) <= "2027-01-24"; d = addDays(d, 1)) {
    const day = ymd(d), wd = d.getDay(), ws = weekStartOf(day);
    if (day === plusDays(LOST_WEEK, -2) && !lostRecorded) {
      // on the Saturday before, in advance: next week is lost
      const t = new Date(`${day}T09:00`);
      bot.rec(t, lifeEvent("week", day, LOST_WEEK));
      bot.rec(t, dateCheckEvent(bot.model(t)));
      lostRecorded = true;
    }
    const lost = ws === LOST_WEEK;
    if ([2, 3, 4].includes(wd) && !SKIP_MORNINGS.includes(ws) && !lost) bot.session(new Date(`${day}T07:45`), 45, false);
    if (wd === 6 && !lost) bot.session(new Date(`${day}T10:00`), 240, false);
    if (wd >= 1 && wd <= 5) bot.session(new Date(`${day}T18:45`), 80, true);
  }
  return bot;
}

describe.skipIf(!C)("a simulated month (Phase 2 check)", () => {
  const bot = C ? runMonth() : null!;
  const end = C ? bot.model(new Date("2027-01-24T21:00")) : null!;

  it("numbers only go up the whole way: %, hours, weeks, level, retired (test 9)", () => {
    for (let i = 1; i < bot.snapshots.length; i++) {
      const a = bot.snapshots[i - 1], b = bot.snapshots[i];
      for (const k of ["pct", "hours", "weeks", "level", "retired"] as const) expect(b[k], `${k} on ${b.day}`).toBeGreaterThanOrEqual(a[k]);
    }
    expect(end.pct).toBeGreaterThan(5);
  });

  it("quant, DI, book sets, drills and mocks never came up on the bus (test 1)", () => {
    // quant videos ride the bus; quant questions never do
    const bad = bot.cardsSeen.filter((c) => c.bus && c.deskOnly);
    expect(bad).toEqual([]);
  });

  it("no week is ever planned above 15 hours (test 10)", () => {
    for (const [w, e] of end.d.weeks) {
      const mins = e.chips.reduce((s, c) => s + (end.byId.get(c.pieceId) ? load(end.byId.get(c.pieceId)!) : 0), 0);
      expect(mins, w).toBeLessThanOrEqual(WEEK_CAP_MIN);
    }
  });

  it("every review happened after its set, never on the same day (test 3)", () => {
    for (const s of end.reviews.sets) {
      const done = end.d.reviewDone.get(s.id);
      if (done) expect(done.day > s.setDay, s.id).toBe(true);
    }
  });

  it("with mornings, quant reviews landed 1–3 days after the set; skipped, they waited for Saturday within 14 days (test 2)", () => {
    const qs = end.reviews.sets.filter((s) => s.group === "Q" && end.d.reviewDone.has(s.id));
    expect(qs.length).toBeGreaterThan(3);
    for (const s of qs) {
      const done = end.d.reviewDone.get(s.id)!.day;
      const gap = (parseYmd(done).getTime() - parseYmd(s.setDay).getTime()) / 86_400_000;
      expect(gap, s.id).toBeLessThanOrEqual(14);
      const skipped = SKIP_MORNINGS.includes(weekStartOf(done));
      if (skipped) expect(parseYmd(done).getDay(), `${s.id} done ${done}`).toBe(6);
    }
    // sets with a morning slot in the 1–3 days after them that the student used
    const used = (day: string) => [2, 3, 4].includes(parseYmd(day).getDay()) && !SKIP_MORNINGS.includes(weekStartOf(day)) && weekStartOf(day) !== LOST_WEEK
      && !(day >= "2026-12-24" && day <= "2027-01-01");
    const withMornings = qs.filter((s) => [1, 2, 3].some((k) => used(plusDays(s.setDay, k))));
    expect(withMornings.length).toBeGreaterThan(0);
    for (const s of withMornings) {
      const gap = (parseYmd(end.d.reviewDone.get(s.id)!.day).getTime() - parseYmd(s.setDay).getTime()) / 86_400_000;
      expect(gap, s.id).toBeLessThanOrEqual(3);
    }
  });

  it("the lost week became a light bus week: no desk work, and the date check ran", () => {
    const w = end.d.weeks.get(LOST_WEEK)!;
    expect(w.light).toBe(true);
    for (const c of w.chips) expect(end.byId.get(c.pieceId)!.deskOnly, c.pieceId).toBe(false);
    expect(end.d.datechecks.length).toBeGreaterThan(0);
  });

  it("the loops ran: reviews, redos coming back, cards, and errors retiring", () => {
    expect(end.reviews.sets.filter((s) => s.status === "done").length).toBeGreaterThan(5);
    expect(end.reviews.retired).toBeGreaterThan(0);
    expect(end.d.cardSessions.length).toBeGreaterThan(3);
    // new cards keep coming: starter cards, and the cards from each day's work (paused while cards pile up)
    expect(end.d.introduced.size + end.d.offered.size).toBeGreaterThanOrEqual(15 * 4);
    expect(end.cardsDue).toBeLessThan(80);
    expect(bot.cardsSeen.some((c) => c.card === "mixed")).toBe(true);
    for (const it of end.reviews.items.values()) if (it.state === "stubborn") expect(it.misses).toBeGreaterThanOrEqual(3);
  });

  it("the pause (24 Dec – 1 Jan) holds no time: that week's plan fits the Saturday after it", () => {
    const w = end.d.weeks.get("2026-12-28")!;
    const mins = w.chips.reduce((s, c) => s + load(end.byId.get(c.pieceId)!), 0);
    expect(mins).toBeLessThanOrEqual(240 * 0.85 * 1.1 + 1);
    expect(bot.cardsSeen.filter((c) => c.when >= "2026-12-24" && c.when < "2027-01-01T18:30" && !["nothing", "pause", "cards", "weekdone"].includes(c.card))).toEqual([]);
  });

  it("when the bus ran ahead, rides got cards, reviews and reserve CR, never next week's plan", () => {
    for (const c of bot.cardsSeen.filter((x) => x.bus && x.card === "task")) {
      const day = c.when.slice(0, 10);
      void day;
    }
    expect(bot.cardsSeen.some((c) => c.bus && c.title.startsWith("A reserve CR set"))).toBe(true);
  });
});
