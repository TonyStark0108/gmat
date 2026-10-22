// The audit of 21 Oct 2026, in a real browser: the free stand-in mock and the timed verbal section
// open with their material, a task you only opened doesn't take over home, and the grid and home fit
// a 390-pixel phone with nothing cut off.

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import type { Content } from "../src/core/content";
import { buildModel } from "../src/core/model";
import { titleOf } from "../src/ui/copy";
import { CONTENT, at, card, firstWeek, hasContent, jumpTo, launch, profileDir, resetAlbum, seed, setPrefix, setStep, settled, snap, writeAlbum } from "./helpers";

test.skip(!hasContent(), "needs data/gmat-content-v1.json (run `npm run content`)");

const notes: string[] = [];
let passed = false;
test.beforeAll(() => { resetAlbum(); setPrefix("basics-"); });
test.afterAll(() => writeAlbum("The basics, after the audit", passed, notes, "album-basics.html"));

/** Nothing on screen reaches past the right edge (a page that doesn't scroll sideways can still clip). */
async function nothingClipped(page: Page, width: number) {
  const over = await page.evaluate((w) => [...document.querySelectorAll("button, input, a, .box")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1; })
    .map((e) => `${e.tagName} ${(e.textContent ?? "").trim().slice(0, 30)}`), width);
  expect(over).toEqual([]);
}

test("the basics, end to end", async () => {
  const content = JSON.parse(fs.readFileSync(CONTENT, "utf-8")) as Content;
  const bot = firstWeek(content);
  const { ctx, page } = await launch(profileDir("basics"), at("2026-12-05T20:30"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Use it anyway/ }).click();
  await page.locator("input[type=file]").setInputFiles(CONTENT);
  await page.getByRole("button", { name: "Skip the intro" }).click();
  await expect(page.getByText("Here's the shape of it.")).toBeVisible();
  await seed(page, [...bot.events, { type: "settings", patch: { exams36: "not bought" }, id: "e-audit-1", ts: at("2026-12-05T20:31").getTime(), day: "2026-12-05" }]);
  await page.reload();
  await settled(page);
  await jumpTo(ctx, page, at("2026-12-08T19:00"));

  setStep("0 · The tour of home (from Settings: Take the tour of home again)");
  await page.goto("/#/?tour=1");
  await settled(page);
  const tip = page.locator(".tour-tip");
  await expect(tip).toContainText("The card");
  await snap(page, "The tour, step 1: the card, lit up; everything else dimmed.");
  for (let i = 0; i < 12 && (await tip.count()); i++) {
    const label = await tip.getByRole("button", { name: /Next|Done/ }).textContent();
    if (/Retired|Mistakes retired/.test((await tip.textContent()) ?? "")) await snap(page, "A later step: mistakes retired, and where they lead.");
    await tip.getByRole("button", { name: /Next|Done/ }).click();
    if (label === "Done") break;
    await page.waitForTimeout(150);
  }
  await expect(page.locator(".tour")).toHaveCount(0);
  notes.push("The home tour ran from start to finish and closed.");

  setStep("1 · The free stand-in mock (Exams 3–6 not bought)");
  await page.goto(`/#/task/${encodeURIComponent("w09-mock-01#0")}`);
  await settled(page);
  await expect(page.getByText(/Three timed sections, 45 minutes each/)).toBeVisible();
  await expect(page.locator(".box", { hasText: "Verbal" })).toContainText("13 CR questions");
  await snap(page, "The stand-in mock: quant and DI from the plan's lists, verbal from 13 reserve CR questions and three reading passages.");

  setStep("2 · A timed verbal section");
  await page.goto(`/#/task/${encodeURIComponent("w09-cr-01#0")}`);
  await settled(page);
  await expect(page.getByText("A timed verbal section: 13 CR questions, then 3 reading passages, 45 minutes in all, in one go.")).toBeVisible();
  await page.getByRole("button", { name: "Then 3 reading passages, in the reader" }).click();
  await expect(page.getByText(/Passage 1 of 3/i)).toBeVisible();
  await snap(page, "Its three passages open in the reader, from a reading set the plan doesn't use.");

  setStep("2b · From GMAT Club's plan: a chapter, a sprint, and how a set felt");
  await page.goto(`/#/task/${encodeURIComponent("mh-ch06#0")}`);
  await settled(page);
  await expect(page.getByText("Read chapter 6, Percents, in your copy of All the Quant + DI", { exact: false })).toBeVisible();
  await snap(page, "A chapter of All the Quant + DI, the week percents first comes up: on screen, so it fits a ride.");
  await page.goto(`/#/task/${encodeURIComponent("sprint-w09-quant-1#0")}`);
  await settled(page);
  await page.getByRole("button", { name: "Start the 20-minute clock" }).click();
  await expect(page.getByText("Question 1 of 10")).toBeVisible();
  await expect(page.getByText("On pace.")).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByText("Question 2 of 10")).toBeVisible();
  await snap(page, "A timed sprint: 10 questions in 20 minutes, a tap per question, and whether you're on pace.");
  await page.goto(`/#/task/${encodeURIComponent("w02-quant-05#0")}`);
  await settled(page);
  await expect(page.getByText(/^(Untimed|Soft-timed|Normal pace):/)).toBeVisible();
  await page.getByRole("button", { name: "more Right" }).click();
  await page.getByRole("button", { name: "Save it" }).click();
  await expect(page.getByText("How did that feel?")).toBeVisible();
  await page.getByRole("button", { name: "Too hard" }).click();
  await expect(page.getByText(/Noted. Next time .* starts easier, with no clock./)).toBeVisible();
  await snap(page, "After a set, one tap: too easy, about right, or too hard. It moves the topic's zone: easier and untimed next time.");

  setStep("3 · A task you only opened doesn't take over home");
  // a book set opened and left with nothing entered isn't "waiting where you left it"
  const book = buildModel(content, bot.events, new Date("2026-12-08T19:00")).plan.find((p) => p.task.kind === "og_set" && p.planWeek >= 4)!;
  await page.goto(`/#/task/${encodeURIComponent(book.id)}`);
  await settled(page);
  await page.goto("/#/");
  await settled(page);
  await expect(card(page).locator(".t")).not.toHaveText(titleOf(book));
  // work on another site that was opened does come back, and "Not now" moves past it
  for (let i = 0; i < 6 && (await card(page).locator(".eyebrow").textContent()) === "Waiting where you left it"; i++) {
    await card(page).getByRole("button", { name: "Not now" }).click();
    await page.waitForTimeout(200);
  }
  await expect(card(page).locator(".eyebrow")).not.toHaveText("Waiting where you left it");
  await snap(page, "Back home: a set you only opened doesn't take over, and anything waiting has “Not now”.");

  setStep("4 · On a 390-pixel phone");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await nothingClipped(page, 390);
  await snap(page, "Home on a phone: the bottom links sit in a tidy grid, nothing cut off.");
  const og = bot.events.find((e) => (e as { type: string }).type === "piece.submitted" && /og|quant/.test((e as { piece: string }).piece)) as { piece: string } | undefined;
  if (og) {
    await page.goto(`/#/task/${encodeURIComponent(og.piece)}`);
    await settled(page);
    await expect(page.getByText(/This one's logged/)).toBeVisible();
    await nothingClipped(page, 390);
    await snap(page, "A logged set on a phone: each row wraps instead of running off the edge, and it reads as logged.");
  }
  expect(errors).toEqual([]);
  notes.push("No page errors on any screen visited.");
  passed = true;
  await ctx.close();
});
