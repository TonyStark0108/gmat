// Bringing things back, in a real browser: the day's new cards (keep, skip, keep them all), what's
// covered from the map, a star on a book question (and the grid still fits a phone), your error log
// from memory, and the week's recap on Saturday.

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import type { Content } from "../src/core/content";
import type { AppEvent } from "../src/core/events";
import { buildModel } from "../src/core/model";
import { CONTENT, at, firstWeek, hasContent, jumpTo, launch, profileDir, resetAlbum, seed, setPrefix, setStep, settled, snap, writeAlbum } from "./helpers";

test.skip(!hasContent(), "needs data/gmat-content-v1.json (run `npm run content`)");

const notes: string[] = [];
let passed = false;
test.beforeAll(() => { resetAlbum(); setPrefix("recall-"); });
test.afterAll(() => writeAlbum("Bringing things back, tested by a robot", passed, notes, "album-recall.html"));

async function events(page: Page): Promise<AppEvent[]> {
  return page.evaluate(() => new Promise<AppEvent[]>((res) => {
    const r = indexedDB.open("gmat");
    r.onsuccess = () => { const q = r.result.transaction("events").objectStore("events").getAll(); q.onsuccess = () => res((q.result as AppEvent[]).sort((a, b) => a.ts - b.ts)); };
  }));
}

test("bringing things back, end to end", async () => {
  const content = JSON.parse(fs.readFileSync(CONTENT, "utf-8")) as Content;
  const bot = firstWeek(content);
  const { ctx, page } = await launch(profileDir("recall"), at("2026-12-05T20:30"));
  await page.goto("/");
  await page.getByRole("button", { name: /Use it anyway/ }).click();
  await page.locator("input[type=file]").setInputFiles(CONTENT);
  await expect(page.getByText("Here's the shape of it.")).toBeVisible();
  await seed(page, bot.events);
  await page.reload();
  await settled(page);

  setStep("1 · Tuesday evening: the day's new cards");
  await jumpTo(ctx, page, at("2026-12-08T19:00"));
  let m = buildModel(content, await events(page), new Date("2026-12-08T19:00"));
  const keptBefore = m.cards.filter((c) => c.source === "topic" || c.source === "error").length;
  notes.push(`After the first week: ${m.sugg.pending.length} new cards offered today, ${m.sugg.waiting.length} waiting their turn, ${m.cardsDue} cards due.`);
  await page.goto("/#/cards/new");
  await settled(page);
  await expect(page.locator(".title")).toHaveText(/new cards? from your work/);
  await snap(page, "New cards from the week's work: each topic's rules, the traps you tagged, a card for a mistake. Keep or skip each with one tap.");
  const boxes = page.locator(".box");
  const before = await boxes.count();
  expect(before).toBeGreaterThan(1);
  await boxes.first().getByRole("button", { name: "Keep" }).click();
  await expect(boxes).toHaveCount(before - 1);
  await boxes.first().getByRole("button", { name: "Skip" }).click();
  await expect(boxes).toHaveCount(before - 2);
  if (before - 2 > 1) await page.getByRole("button", { name: "Keep them all" }).click();
  else if (before - 2 === 1) await boxes.first().getByRole("button", { name: "Keep" }).click();
  await expect.poll(async () => buildModel(content, await events(page), new Date("2026-12-08T19:10")).sugg.pending.length).toBe(0);
  m = buildModel(content, await events(page), new Date("2026-12-08T19:10"));
  expect(m.cards.filter((c) => c.source === "topic" || c.source === "error").length).toBe(keptBefore + before - 1);

  setStep("2 · What's covered, from the map");
  await page.goto("/#/map");
  await settled(page);
  await expect(page.locator(".map-covered")).toContainText(/of 25 topics started · every one has its cards/);
  await page.locator(".map-covered").click();
  await expect(page.locator(".title")).toHaveText(/of 25 topics started/);
  await expect(page.getByText("Every topic has its cards.")).toBeVisible();
  await expect(page.locator(".box", { hasText: "Probability" })).toContainText("Comes up later");
  await snap(page, "What's covered: every topic the plan teaches, whether you've started it, its cards, and where it stands. Words, never scores.");

  setStep("3 · A star on a book question, and the grid on a phone");
  const og = m.plan.find((p) => p.task.kind === "og_set" && m.d.submitted.has(p.id))!;
  await page.goto(`/#/task/${encodeURIComponent(og.id)}`);
  await settled(page);
  const star = page.locator(".star").nth(1);
  await expect(star).toHaveText("☆");
  await star.click();
  await expect(star).toHaveText("★");
  await snap(page, "☆ on any question: starred, it comes back in a week and again two weeks later, even when it was right.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect.poll(async () => buildModel(content, await events(page), new Date("2026-12-08T19:20")).d.looks.size).toBeGreaterThan(0);

  setStep("4 · Thursday: your error log, from memory");
  await jumpTo(ctx, page, at("2026-12-10T19:30"));
  m = buildModel(content, await events(page), new Date("2026-12-10T19:30"));
  const recall = [...m.d.extras.values()].find((x) => x.kind === "recall");
  notes.push(recall ? `Thursday's recall task was added: ${recall.title}.` : "No recall task on Thursday (fewer than three groups of mistakes).");
  expect(recall).toBeTruthy();
  await page.goto(`/#/task/${encodeURIComponent(`x:${recall!.id}#0`)}`);
  await settled(page);
  await expect(page.getByText("What's your rule for these? Say it, or write it, before you look.").or(page.getByText(/What made these worth another look/))).toBeVisible();
  await page.locator("textarea").fill("Read what's being asked before solving.");
  await snap(page, "Your error log, from memory: your own rule for a group of mistakes first.");
  await page.getByRole("button", { name: "Show my notes" }).click();
  await snap(page, "Then what you wrote, and the rule. Anything new you wrote becomes a card.");
  for (let i = 0; i < 10 && await page.getByRole("button", { name: "Next" }).isVisible(); i++) {
    if (await page.getByRole("button", { name: "Show my notes" }).isVisible()) await page.getByRole("button", { name: "Show my notes" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByRole("button", { name: /Start the questions|Done/ })).toBeVisible();
  await snap(page, "Every group gone through. Then a few of the questions again (practice: the regular review keeps its dates).");
  await page.getByRole("button", { name: /Start the questions|Done/ }).click();

  setStep("5 · Saturday: the week's recap");
  for (const day of ["2026-12-09T19:00", "2026-12-11T19:00", "2026-12-12T09:00"]) await jumpTo(ctx, page, at(day));
  m = buildModel(content, await events(page), new Date("2026-12-12T09:00"));
  const recap = [...m.d.extras.values()].find((x) => x.kind === "recap");
  notes.push(recap ? `Saturday's recap: ${recap.title}.` : "No recap this Saturday (fewer than five cards made this week).");
  if (recap) {
    await page.goto(`/#/task/${encodeURIComponent(`x:${recap.id}#0`)}`);
    await settled(page);
    await expect(page.getByText("This week's recap · Cards", { exact: false })).toBeVisible();
    await snap(page, "Saturday: the week's own cards, mixed.");
  }

  passed = true;
  await ctx.close();
});
