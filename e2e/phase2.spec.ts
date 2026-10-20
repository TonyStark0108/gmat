// Phases 2 and 3 in a real browser: a simulated first week goes into a fresh profile, then the robot
// does the review a few days later by keyboard, a card session, a mixed review, a CR set on the bus,
// "something came up", a question sent in from GMAT Club, the Sunday note, a mock, and the progress
// pages. Answers are typed; the trackpad is never needed for a review or cards (test 13).

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import type { Content } from "../src/core/content";
import { markOne } from "../src/core/grid";
import { buildModel } from "../src/core/model";
import { Bot } from "../tests/bot";
import { CONTENT, at, card, expectCardTitle, hasContent, jumpTo, launch, profileDir, resetAlbum, setPrefix, setStep, settled, snap, writeAlbum } from "./helpers";

test.skip(!hasContent(), "needs data/gmat-content-v1.json (run `npm run content`)");

const notes: string[] = [];
let passed = false;
test.beforeAll(() => { resetAlbum(); setPrefix("p2-"); });
test.afterAll(() => writeAlbum("Phases 2 and 3, tested by a robot", passed, notes, "album-phase2.html"));

/** The first week, done by the simulated student: mornings, Saturday and the rides, through Saturday 5 December. */
function firstWeek(content: Content) {
  const bot = new Bot(content, 5, 0.7);
  bot.setup(new Date("2026-11-28T11:00"));
  for (const day of ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]) {
    const wd = new Date(`${day}T12:00`).getDay();
    if ([2, 3, 4].includes(wd)) bot.session(new Date(`${day}T07:45`), 45, false);
    if (wd === 6) bot.session(new Date(`${day}T10:00`), 240, false);
    if (wd >= 1 && wd <= 5) bot.session(new Date(`${day}T18:45`), 80, true);
  }
  return bot;
}

async function seed(page: Page, events: unknown[]) {
  await page.evaluate((evs) => new Promise<void>((res, rej) => {
    const r = indexedDB.open("gmat");
    r.onsuccess = () => {
      const tx = r.result.transaction("events", "readwrite");
      for (const e of evs as object[]) tx.objectStore("events").put(e);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
  }), events);
}

test("phases 2 and 3, end to end", async () => {
  const content = JSON.parse(fs.readFileSync(CONTENT, "utf-8")) as Content;
  const bot = firstWeek(content);
  notes.push(`The simulated first week: ${bot.events.length} records, ${bot.snapshots[bot.snapshots.length - 1].pct}% done.`);

  const { ctx, page } = await launch(profileDir("p2"), at("2026-12-05T20:30"));
  await page.goto("/");
  await page.getByRole("button", { name: /Use it anyway/ }).click();
  await page.locator("input[type=file]").setInputFiles(CONTENT);
  await expect(page.getByText("Here's the shape of it.")).toBeVisible();
  await seed(page, bot.events);
  await page.reload();
  await settled(page);

  // ------------------------------------------------------------------ the review, a few days later
  setStep("1 · Tuesday 8 December, 07:50: the review of Saturday's quant, by keyboard");
  await jumpTo(ctx, page, at("2026-12-08T07:50"));
  await expect(card(page).locator(".eyebrow")).toHaveText(/review/i);
  await snap(page, "Tuesday's morning slot: Saturday's set comes back as its review chip, 1–3 days later. Double outline: review.");
  const m = buildModel(content, bot.events, new Date("2026-12-08T07:50"));
  const set = m.reviews.sets.filter((s) => s.status === "open" && s.group === "Q").sort((a, b) => (a.windowFrom < b.windowFrom ? -1 : 1))[0];
  await page.keyboard.press("Enter");
  await expect(page.getByText(/to look at again\./)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/the answer:/i);
  await snap(page, "The blind retry: from scratch, letters hidden.");
  // the first one wrong again (it'll come back), the rest right
  for (const [i, it] of set.items.entries()) {
    const wrong = ["A", "B", "C", "D", "E"].find((L) => markOne(L, it.key as string) !== "right")!;
    const letter = i === 0 ? wrong : typeof it.key === "string" ? it.key : "A";
    await page.keyboard.press(letter.toLowerCase());
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
  }
  await expect(page.getByText(/came right\./)).toBeVisible();
  await snap(page, "Right or wrong only, as dots. Still no letters.");
  await page.keyboard.press("Enter");
  if (await page.getByText("Last try.").isVisible()) {
    await page.keyboard.press("a"); await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    while (await page.getByText("Last try.").isVisible()) { await page.keyboard.press("b"); await page.keyboard.press("Enter"); await page.waitForTimeout(150); }
  }
  await expect(page.getByText("Here they are.")).toBeVisible();
  await snap(page, "Here they are: your letter beside the right one, where the explanation is, and “My book says…” for every mark.");
  await page.keyboard.press("Enter");
  if (await page.getByText("Why each one went wrong.").isVisible()) {
    await snap(page, "A reason for each one that was wrong the first time (1–4 on the keyboard), and an optional line that becomes a card.");
    for (let i = 0; i < set.items.length; i++) await page.keyboard.press("2");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("button", { name: "Back to today" })).toBeVisible();
  await snap(page, "The close: one line of diagnosis, the careless-slip bar, and what got scheduled.");
  await page.keyboard.press("Enter");
  await settled(page);

  // ------------------------------------------------------------------ the week screen
  setStep("2 · The week, with its review chips");
  await page.goto("/#/week");
  await expect(page.getByRole("button", { name: /^Review · / }).first()).toBeVisible();
  await snap(page, "The week: plan chips, review chips (double outline), extras, Cards and the rest day.");

  // ------------------------------------------------------------------ cards by keyboard
  setStep("3 · A card session, by keyboard");
  await page.goto("/#/cards");
  await settled(page);
  await snap(page, "A card: the front first.");
  await page.keyboard.press(" ");
  await snap(page, "Space shows the back. 1 is Again, 2 is Got it.");
  for (let i = 0; i < 20 && !(await page.getByText("That's the session.").isVisible()); i++) {
    await page.keyboard.press(" ");
    await page.keyboard.press(i % 4 === 0 ? "1" : "2");
    await page.waitForTimeout(80);
  }
  await expect(page.getByText("That's the session.")).toBeVisible();
  await page.keyboard.press("Enter");
  await settled(page);

  // ------------------------------------------------------------------ a mixed review
  setStep("4 · Wednesday 9 December, 07:50: the one that came out wrong again, in a mixed review");
  await jumpTo(ctx, page, at("2026-12-09T07:50"));
  for (let i = 0; i < 3 && !(await card(page).locator(".t").textContent())?.includes("mixed"); i++) {
    // other reviews first, if any are open: finish them by keyboard
    if ((await card(page).locator(".eyebrow").textContent())?.match(/review/i) && (await card(page).locator(".t").textContent())?.startsWith("The review")) {
      await page.keyboard.press("Enter");
      for (let k = 0; k < 60 && !(await page.getByRole("button", { name: "Back to today" }).isVisible()); k++) {
        await page.keyboard.press("c"); await page.keyboard.press("2"); await page.keyboard.press("Enter"); await page.waitForTimeout(100);
      }
      await page.keyboard.press("Enter");
      await settled(page);
    } else break;
  }
  await expect(card(page).locator(".t")).toContainText("mixed");
  await snap(page, "Second tries come back mixed, the next day. Returning ones aren't marked as returning.");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Mixed review · 1 of/)).toBeVisible();
  await snap(page, "One question at a time: where it is in the book, and the letters.");
  for (let k = 0; k < 12 && !(await page.getByRole("button", { name: "Back to today" }).isVisible()); k++) {
    await page.keyboard.press("a"); await page.keyboard.press("Enter"); await page.waitForTimeout(150);
    await page.keyboard.press("1"); await page.keyboard.press("Enter"); await page.waitForTimeout(150);
  }
  await expect(page.getByText(/of \d+ right\./)).toBeVisible();
  await snap(page, "Done: how many came right. Anything retired says so.");
  await page.keyboard.press("Enter");
  await settled(page);

  // ------------------------------------------------------------------ a CR set on the bus
  setStep("5 · Wednesday 9 December, 18:45, on the bus: a CR set");
  await jumpTo(ctx, page, at("2026-12-09T18:45"));
  await page.keyboard.press("b");
  await expect(page.locator(".status")).toContainText("bus");
  await page.goto("/#/week");
  const crChip = page.getByRole("button", { name: /An LSAT CR set/ }).first();
  if (await crChip.isVisible()) {
    await crChip.click();
    await expect(page.getByText(/All in one go, under an hour/)).toBeVisible();
    await snap(page, "A CR set on GMAT Club: 25 links, one at a time, each with “Didn't load” and a swap from the reserve sets.");
    await page.getByRole("button", { name: /I've done all/ }).click();
    await page.keyboard.type("ABCDE?ABCDEABCDE?ABCDEABCDE");
    await snap(page, "At the end, all the letters in one line; a ? marks the not-sure ones.");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^Logged\./)).toBeVisible();
    await snap(page, "Logged: a count, never letters. The official answers go in at the review.");
    await page.keyboard.press("Enter");
  } else notes.push("No LSAT CR set left in that week to try on the bus.");
  await page.goto("/#/");
  await settled(page);
  await page.keyboard.press("b");

  // ------------------------------------------------------------------ something came up
  setStep("6 · Thursday 10 December: something came up tonight");
  await jumpTo(ctx, page, at("2026-12-10T17:30"));
  await page.getByRole("button", { name: "Something came up" }).click();
  await snap(page, "Something came up: tonight, this weekend or a whole week, now or in advance.");
  await page.getByRole("button", { name: "Tonight" }).click();
  await expect(page.getByText(/Tonight's clear\./)).toBeVisible();
  await snap(page, "Tonight's clear. The week is rebuilt around it, quietly.");
  await page.getByRole("button", { name: "Back to today" }).click();

  // ------------------------------------------------------------------ sending a question in
  setStep("7 · Sending a question in from GMAT Club");
  await page.goto("/#/share?u=" + encodeURIComponent("https://gmatclub.com/forum/a-question-about-percents-123456.html"));
  await expect(page.getByText("What's it about?")).toBeVisible();
  await snap(page, "Outside a set, the bookmark asks for the topic: the only picker in the app.");
  await page.getByRole("button", { name: "percents", exact: true }).click();
  await expect(page.getByText(/Saved — it'll come back on \w+day\./)).toBeVisible();
  await snap(page, "Saved. It comes back as a redo, with the exact link.");

  // ------------------------------------------------------------------ the Sunday note
  setStep("8 · Sunday 13 December, 18:00: the Sunday note");
  await jumpTo(ctx, page, at("2026-12-13T18:00"));
  await page.goto("/#/");
  await settled(page);
  await expect(page.getByText("The Sunday note")).toBeVisible();
  await expect(page.getByText(/^Week 2 is (done|closed)\./)).toBeVisible();
  await snap(page, "The Sunday note, inside the app: the week in a line, next week's shape, and a Share button.");
  await page.getByRole("button", { name: "OK" }).click();

  // ------------------------------------------------------------------ progress and what to work on
  setStep("9 · Progress, and what to work on");
  await page.goto("/#/progress");
  await expect(page.getByText("The journey")).toBeVisible();
  await snap(page, "Progress: the journey, the climb against where the plan expects you, section bars and milestones.");
  await page.goto("/#/errors");
  await expect(page.getByText(/\d+ retired · \d+ in review/)).toBeVisible();
  await snap(page, "What to work on: the biggest groups still in review, headed in your own words.");

  // ------------------------------------------------------------------ a mock
  setStep("10 · An official mock (opened directly, to see the screens)");
  await page.goto("/#/task/" + encodeURIComponent("w08-mock-02#0"));
  await expect(page.getByText(/Answer every question; blanks cost more than guesses\./)).toBeVisible();
  await snap(page, "The mock: mba.com with “Didn't load” (it moves to tomorrow), Move it, and the scores when you're back.");
  for (const [k, v] of [["total", "625"], ["quant", "80"], ["verbal", "84"], ["di", "76"]]) await page.getByLabel(k).fill(v);
  await page.getByRole("button", { name: "Save the scores" }).click();
  await expect(page.getByText(/On track for this point in the plan\.|Further from 665/)).toBeVisible();
  await snap(page, "The verdict against that week's own gap (50 points at week 8), then up to ten misses tagged.");

  // ------------------------------------------------------------------ settings
  setStep("11 · Settings");
  await page.goto("/#/settings");
  await expect(page.getByText("Send to GMAT app").first()).toBeVisible();
  await snap(page, "Settings: dates and times, the booked test date (only once booked), focus and break, cards, the bookmark, backup.");

  // ------------------------------------------------------------------ months later: back, booking, the end game
  setStep("12 · Months later: the warmest welcome, and the booking card at the book-by date");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/");
  await jumpTo(ctx, page, at("2027-07-02T19:00"));
  await expect(card(page).locator(".t")).toHaveText("Back. That's the whole game.");
  await expect(page.getByText(/It's your book-by date\./)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/missed|behind|overdue|days left/i);
  await snap(page, "After a long gap: nothing about the gap, a short cards warm-up, and (at the book-by date) the booking card.");
  await page.getByRole("button", { name: "I've booked" }).click();
  await page.locator(".note input[type=date]").fill("2027-07-23");
  await page.getByRole("button", { name: "That's my test date" }).click();
  await expect(page.getByText(/It's your book-by date\./)).toHaveCount(0);

  setStep("13 · Test week, counted back from the booked date");
  await jumpTo(ctx, page, at("2027-07-20T08:00"));
  await expect(card(page).locator(".t")).toHaveText("The test-day checklist.");
  await snap(page, "Three days before: one checklist card. No countdown anywhere.");
  await jumpTo(ctx, page, at("2027-07-22T08:00"));
  await expect(card(page).locator(".t")).toHaveText("Nothing today. Sleep does the rest.");
  await jumpTo(ctx, page, at("2027-07-23T07:00"));
  await expect(card(page).locator(".t")).toHaveText("Today's the test. Nothing else is on here.");
  await snap(page, "Test day.");
  await jumpTo(ctx, page, at("2027-07-25T10:00"));
  await expect(page.getByText("How did it go?")).toBeVisible();
  await page.getByPlaceholder("205–805").fill("675");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("That's it. Well done.")).toBeVisible();
  await snap(page, "After the test: the score if you want to give it, then the app goes quiet. Your data stays.");
  expect(errors).toEqual([]);
  await ctx.close();
  passed = true;
});
