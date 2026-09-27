// The Phase 1 checklist (docs/phase1-test.md), done by a robot: first run, a morning slot with no
// Wi-Fi, a bus ride, closing the browser mid-set, a backup and a restore into a fresh profile.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  CONTENT, OUT, at, card, eventCount, expectCardTitle, hasContent, jumpTo, launch, profileDir, setStep, settled, snap, writeAlbum,
} from "./helpers";

test.skip(!hasContent(), "needs data/gmat-content-v1.json (run `npm run content`)");

const notes: string[] = [];
let passed = false;
test.afterAll(() => writeAlbum("Phase 1, tested by a robot", passed, notes));

async function typeAnswer(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test("the Phase 1 checklist, end to end", async () => {
  const dirA = profileDir("a");
  let { ctx, page } = await launch(dirA, at("2026-11-28T11:00"));
  const reopen = async (when: Date, offline = false) => {
    await ctx.close();
    ({ ctx, page } = await launch(dirA, when, { offline }));
    await page.goto("/");
    await settled(page);
  };

  // ------------------------------------------------------------------ 1. first run
  setStep("1 · First run: the three laptop checks");
  await page.goto("/");
  await expect(page.getByText("Three checks on this laptop.")).toBeVisible();
  await expect(page.getByText(/The browser (will keep|didn't promise)/)).toBeVisible();
  await snap(page, "The day-one check opens first. Nothing you study goes in until it's done.");
  await page.getByRole("button", { name: "Save the marker" }).click();
  await expect(page.getByText("Now close the browser completely")).toBeVisible();
  await snap(page, "The marker is saved. Next: close the whole browser and open it again.");

  await reopen(at("2026-11-28T11:02"));
  await expect(page.getByText("Your data survived closing the browser.")).toBeVisible();
  await page.getByRole("button", { name: "Pick a folder" }).click();
  await expect(page.getByText("The backup folder can be written to.")).toBeVisible();
  await snap(page, "After closing and reopening the browser: the data survived, and the backup folder can be written to.");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // ------------------------------------------------------------------ 2. study file and setup
  setStep("2 · The study file and the two setup screens");
  await expect(page.getByText("Load the study file once.")).toBeVisible();
  await snap(page, "The study file screen says where the file is.");
  await page.locator("input[type=file]").setInputFiles(CONTENT);
  await expect(page.getByText("Here's the shape of it.")).toBeVisible();
  const pace = await page.getByText(/At this pace: \d{1,2} \w+ \d{4}\./).textContent();
  notes.push(`Setup worked out the finish date: ${pace?.match(/At this pace: (.*)\./)?.[1]}.`);
  await snap(page, `Setup screen 1, pre-filled. ${pace?.match(/At this pace: .*\./)?.[0]}`);
  await page.locator(".field", { hasText: "Finish" }).locator("input[type=date]").fill("2027-06-01");
  await expect(page.getByText(/To finish by 1 June 2027:/)).toBeVisible();
  await snap(page, "Typing an earlier finish date shows what it would take.");
  await page.getByRole("button", { name: "work it out" }).click();
  await expect(page.getByText(/To finish by/)).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("On a bus? One tap.")).toBeVisible();
  await snap(page, "Setup screen 2: how to start bus mode.");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByText("0%")).toBeVisible();
  await expectCardTitle(page, "Make a free mba.com account");
  await snap(page, "Home before 1 December: zeroes and the warm-up card.");
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>("link[rel=manifest]")!.href)).json());
  expect(manifest.shortcuts?.[0]?.name).toBe("Bus ride");

  // ------------------------------------------------------------------ 3. the first morning slot
  setStep("3 · Tuesday 1 December, 07:50: a morning slot");
  await jumpTo(ctx, page, at("2026-12-01T07:50"));
  await expectCardTitle(page, "How to use the study plan");
  await snap(page, "The first plan morning. Week 1 waits on the plan's “watch this first” video, so the slot offers it.");
  // watch the videos that week 1's quant work waits on (no YouTube in the test: mark them watched)
  for (let i = 0; i < 4 && (await card(page).locator(".pill").first().textContent()) === "plays here"; i++) {
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Mark it watched" }).click();
    await expect(page.locator(".card")).toBeVisible();
  }
  await expect(card(page).locator(".eyebrow")).toHaveText("Quant");
  await snap(page, "With the videos done, the morning card is quant work that fits in the 40 minutes left.");

  // ------------------------------------------------------------------ 4. Saturday, no Wi-Fi, an OG half-set by keyboard
  setStep("4 · Saturday 5 December, 10:05, Wi-Fi off: an OG half-set by keyboard");
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await ctx.setOffline(true);
  await jumpTo(ctx, page, at("2026-12-05T10:05"));
  await expect(page.locator(".status")).toContainText("no signal");
  await snap(page, "No signal: the app still opens, from its own copy on the laptop.");
  await settled(page);
  await page.keyboard.press("w");
  await page.getByRole("button", { name: /OG problem solving, first half/ }).click();
  await expect(page.getByText("0 of 12 entered")).toBeVisible();
  for (const a of ["1b", "2cs", "d", "4a", "5e", "6c"]) await typeAnswer(page, a);
  await expect(page.getByText("6 of 12 entered")).toBeVisible();
  await snap(page, "Typed: 1b, 2cs (not sure), then letters on their own for the next ones. Six answers in.");

  setStep("4b · The browser closes halfway through the set");
  await reopen(at("2026-12-05T10:31"), true);
  await expect(card(page).locator(".eyebrow")).toHaveText("Waiting where you left it");
  await expect(card(page)).toContainText("6 of 12");
  await snap(page, "Browser closed mid-set and reopened with no signal: the card says “Waiting where you left it”, 6 of 12.");
  await page.keyboard.press("Enter");
  await expect(page.getByText("6 of 12 entered")).toBeVisible();
  for (const a of ["7b", "8c", "9d", "10a", "11b", "12e"]) await typeAnswer(page, a);
  await page.keyboard.press("Enter");      // Enter on an empty box: done
  await expect(page.getByText("First half done. The rest comes up next.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/answer (is|was)|correct answer/i);
  await snap(page, "Done with the half, all by keyboard. A count at most, never the right letters.");
  await page.keyboard.press("Enter");

  // ------------------------------------------------------------------ 5. the bus
  setStep("5 · Monday 7 December, 18:45, on the bus with no signal");
  await jumpTo(ctx, page, at("2026-12-07T18:45"));
  await page.keyboard.press("b");
  await expect(page.locator(".status")).toContainText("bus");
  await snap(page, "B turns bus mode on: the mix switch goes and the card is ride work.");
  await page.keyboard.press("w");
  await page.getByRole("button", { name: /An LSAT reading set/ }).first().click();
  await expect(page.getByText(/Passage 1 of 4/i)).toBeVisible();
  await snap(page, "The reading set opens in the reader, in a plain reading font.");
  await page.keyboard.press("Enter");                               // I've read it
  await page.keyboard.type("Assimilation and language: the author backs keeping Spanish in schools.");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Question 1 of", { exact: false })).toBeVisible();
  let guard = 0;
  while (await page.getByText(/Passage 1 of 4/i).isVisible() && guard++ < 12) {
    await page.keyboard.press("c");
    await expect(page.locator(".choice.on")).toHaveText(/^C/);
    if (guard === 1) {
      await page.keyboard.press("f");
      await expect(page.getByRole("button", { name: "stumped" })).toBeVisible();
      await snap(page, "Passage left, question right. C picks an answer, F flags it “stumped”.");
    }
    await page.keyboard.press("Enter");
  }
  await expect(page.getByText(/Passage 2 of 4/i)).toBeVisible();
  await page.keyboard.press("p");                                   // pause after a passage
  await page.goto("/#/");
  await settled(page);
  await expect(card(page).locator(".eyebrow")).toHaveText("Waiting where you left it");
  await snap(page, "Paused after passage 1. Home offers to carry on from there.");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Passage 2 of 4/i)).toBeVisible();
  await snap(page, "Carry on: it resumes at passage 2.");
  await page.goto("/#/");
  await settled(page);
  await page.keyboard.press("b");                                   // off the bus

  // ------------------------------------------------------------------ 6. backup, and a restore into a fresh profile
  setStep("6 · Backup, then a restore into a fresh browser profile");
  await ctx.setOffline(false);
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Back up a copy" }).click();
  await expect(page.getByText("Saved in your backup folder.")).toBeVisible();
  await snap(page, "Settings → Back up a copy: saved into the backup folder.");
  const backup = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) names.push(name);
    const file = names.filter((n) => n.startsWith("gmat-backup-")).sort().pop()!;
    return { file, text: await (await (await dir.getFileHandle(file)).getFile()).text() };
  });
  const backupPath = path.join(OUT, backup.file);
  fs.writeFileSync(backupPath, backup.text);
  const eventsA = await eventCount(page);
  await page.goto("/#/week");
  await expect(page.getByText(/(\w+) done\.|Nothing done yet\./)).toBeVisible();
  const weekA = await page.locator(".column").innerText();
  await page.goto("/#/");
  const pctA = await page.getByText(/^\d+%$/).textContent();

  const fresh = await launch(profileDir("b"), at("2026-12-07T21:00"));
  const p2 = fresh.page;
  await p2.goto("/");
  await p2.getByRole("button", { name: /Use it anyway/ }).click();
  await p2.locator("input[type=file]").setInputFiles(CONTENT);
  await p2.getByRole("button", { name: "Next", exact: true }).click();
  await p2.getByRole("button", { name: "Got it" }).click();
  await expect(p2.getByText("0%")).toBeVisible();
  await p2.goto("/#/settings");
  await expect(p2.getByRole("button", { name: "Restore a backup" })).toBeVisible();
  await p2.locator("input[type=file]").first().setInputFiles(backupPath);
  await expect(p2.getByText(/Restored \d+ records\./)).toBeVisible();
  await snap(p2, "A fresh browser profile: Settings → Restore a backup.");
  expect(await eventCount(p2)).toBeGreaterThanOrEqual(eventsA);
  await p2.goto("/#/week");
  await expect(p2.getByText(/(\w+) done\.|Nothing done yet\./)).toBeVisible();
  const weekB = await p2.locator(".column").innerText();
  const doneLine = (t: string) => t.match(/\w+ done\.|Nothing done yet\./)?.[0];
  expect(doneLine(weekB)).toBe(doneLine(weekA));
  const chipsOf = (t: string) => t.split(/\r?\n/).filter((l) => l && !/(am|pm)$/.test(l));
  expect(chipsOf(weekB)).toEqual(chipsOf(weekA));
  await snap(p2, "The restored profile's week matches the original, chip for chip.");
  await p2.goto("/#/");
  await expect(p2.getByText(/^\d+%$/)).toHaveText(pctA!);
  notes.push(`Backup had ${eventsA} records; the fresh profile restored all of them and shows the same ${pctA} done.`);
  await fresh.ctx.close();
  await ctx.close();
  passed = true;
});
