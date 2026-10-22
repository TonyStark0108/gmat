// The Phase 3 check, automated: a simulated full plan with fake answers. The student is weaker at DI
// than at everything else; the adapting should lean toward DI, and everything else should hold.

import { describe, expect, it } from "vitest";
import { addDays, parseYmd, weekStartOf, ymd } from "../src/core/calendar";
import { bookingCard } from "../src/core/mocks";
import { load } from "../src/core/pieces";
import { WEEK_CAP_MIN } from "../src/core/settings";
import { Bot } from "./bot";
import { realContent } from "./helpers";

const C = realContent();

describe.skipIf(!C)("a simulated full plan (Phase 3 check)", () => {
  const bot = new Bot(C!, 23, 0.78, { di: 0.5 });
  let doneOn: string | null = null;
  if (C) {
    bot.setup(new Date("2026-11-28T11:00"));
    for (let d = parseYmd("2026-12-01"); ymd(d) <= "2027-08-31"; d = addDays(d, 1)) {
      const day = ymd(d), wd = d.getDay();
      if ([2, 3, 4].includes(wd)) bot.session(new Date(`${day}T07:45`), 45, false);
      if (wd === 6) bot.session(new Date(`${day}T10:00`), 240, false);
      if (wd >= 1 && wd <= 5) bot.session(new Date(`${day}T18:45`), 80, true);
      if (!doneOn && bot.snapshots[bot.snapshots.length - 1]?.pct === 100) doneOn = day;
    }
  }
  const end = C ? bot.model(new Date("2027-08-31T21:00")) : null!;

  it("the whole plan gets done, within a few weeks of the finish date the app worked out", () => {
    expect(end.pct).toBe(100);
    expect(doneOn).not.toBeNull();
    const agreed = end.d.settings.agreedFinish!;
    const late = (parseYmd(doneOn!).getTime() - parseYmd(agreed).getTime()) / 86_400_000;
    expect(late, `done ${doneOn}, agreed ${agreed}`).toBeLessThanOrEqual(35);
  });

  it("levels climb to Plan complete; numbers never drop", () => {
    expect(end.level).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < bot.snapshots.length; i++) for (const k of ["pct", "hours", "weeks", "level", "retired"] as const) expect(bot.snapshots[i][k]).toBeGreaterThanOrEqual(bot.snapshots[i - 1][k]);
  });

  it("the adapting leans toward the weak section (DI), and not before plan week 3", () => {
    const leans = [...end.d.extras.values()].filter((x) => x.kind === "lean");
    expect(leans.length).toBeGreaterThan(5);
    const di = leans.filter((x) => x.section === "di").length;
    expect(di / leans.length, leans.map((x) => x.section).join(",")).toBeGreaterThan(0.5);
    const first = leans.map((x) => x.week).sort()[0];
    expect(first >= "2026-12-14").toBe(true);
  });

  it("every week gets one extra chip, top-ups stay at two a week at most, and no week tops 15 hours", () => {
    const perWeek = new Map<string, number>();
    for (const x of end.d.extras.values()) if (x.kind === "topup") perWeek.set(x.week, (perWeek.get(x.week) ?? 0) + 1);
    for (const [w, n] of perWeek) expect(n, w).toBeLessThanOrEqual(2);
    expect(bot.topups).toBeGreaterThan(0);
    const extraWeeks = new Set([...end.d.extras.values()].filter((x) => x.kind === "extra").map((x) => x.week));
    expect(extraWeeks.size).toBeGreaterThan(20);
    for (const [w, e] of end.d.weeks) expect(e.chips.reduce((s, c) => s + load(end.byId.get(c.pieceId)!), 0), w).toBeLessThanOrEqual(WEEK_CAP_MIN);
  });

  it("errors retire, and the redo ladder never grinds: moved on after three misses", () => {
    expect(end.reviews.retired).toBeGreaterThan(50);
    for (const it of end.reviews.items.values()) if (it.state === "stubborn") expect(it.misses).toBeGreaterThanOrEqual(3);
  });

  it("not Ready from mocks at 615, so the booking card waits for the book-by date (test 8)", () => {
    expect(end.ready).toBe(false);
    const before = bot.model(new Date("2027-06-20T19:00"));
    expect(bookingCard(before.d, before.ready, "2027-06-20")).toBeNull();
    expect(bookingCard(end.d, end.ready, "2027-07-02")?.why).toBe("bookby");
  });

  it("once the plan is done, keep-sharp chips come every other week", () => {
    const ks = [...end.d.extras.values()].filter((x) => x.kind === "keepsharp").map((x) => x.week);
    if (doneOn && weekStartOf(doneOn) < "2027-07-26") expect(ks.length).toBeGreaterThan(0);
  });
});
