// The map in a real browser: after a simulated first week, the path shows what's done and what's left,
// later weeks stay folded until tapped, a task on this week's chips starts from its circle, and the
// whole thing fits a 390-pixel phone.

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import type { Content } from "../src/core/content";
import { buildMap } from "../src/core/map";
import { buildModel } from "../src/core/model";
import { CONTENT, at, firstWeek, hasContent, jumpTo, launch, profileDir, resetAlbum, seed, setPrefix, setStep, settled, snap, writeAlbum } from "./helpers";

test.skip(!hasContent(), "needs data/gmat-content-v1.json (run `npm run content`)");

const notes: string[] = [];
let passed = false;
test.beforeAll(() => { resetAlbum(); setPrefix("map-"); });
test.afterAll(() => writeAlbum("The map, tested by a robot", passed, notes, "album-map.html"));

test("the map, end to end", async () => {
  const content = JSON.parse(fs.readFileSync(CONTENT, "utf-8")) as Content;
  const bot = firstWeek(content);
  const { ctx, page } = await launch(profileDir("map"), at("2026-12-05T20:30"));
  await page.goto("/");
  await page.getByRole("button", { name: /Use it anyway/ }).click();
  await page.locator("input[type=file]").setInputFiles(CONTENT);
  await page.getByRole("button", { name: "Skip the intro" }).click();
  await expect(page.getByText("Here's the shape of it.")).toBeVisible();
  await seed(page, bot.events);
  await page.reload();
  await settled(page);
  await jumpTo(ctx, page, at("2026-12-08T19:00"));

  setStep("1 · Tuesday evening: the map from the home screen");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const map = buildMap(buildModel(content, bot.events, new Date("2026-12-08T19:00")), null);
  notes.push(`After the first week: ${map.doneTasks} of ${map.totalTasks} tasks, about ${map.hoursLeft} hours left, plan week ${map.currentWeek} open.`);
  await expect(page.getByText(`of ${map.totalTasks} tasks`)).toBeVisible();
  await expect(page.locator(".map-unit").first()).toBeVisible();
  await expect(page.locator(".map-node.done").first()).toBeVisible();
  await snap(page, "The map: the week you're in is open, one circle per task, coloured by subject. Ticks are done.");

  setStep("2 · A later week stays folded until tapped, and can't be started");
  const later = page.locator(".map-later").last();
  await expect(later).toContainText("Week 13");
  await later.click();
  const unit13 = page.locator(".map-unit", { hasText: "Week 13" });
  await expect(unit13).toBeVisible();
  await unit13.locator(".map-node").first().click();
  await expect(unit13.getByText(/Comes up with plan week 13/)).toBeVisible();
  await expect(unit13.getByRole("button", { name: "Start" })).toHaveCount(0);
  await snap(page, "Week 13, peeked: you can look, nothing to start. It comes up in order.");
  await unit13.getByRole("button", { name: "fold" }).click();
  await expect(unit13).toHaveCount(0);

  setStep("3 · A circle on this week's chips starts the task");
  const open = page.locator(".map-node.next, .map-node.open, .map-node.half").first();
  await open.click();
  await snap(page, "Tap a circle: what it is, how long, and Start if it's on this week.");
  await page.locator(".map-pop").getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/#?\/task\//);

  setStep("4 · On a 390-pixel phone");
  await page.goBack();
  await expect(page.getByText("The map")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".map-unit").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await snap(page, "The map on a phone: nothing off the edge.");

  passed = true;
  await ctx.close();
});
