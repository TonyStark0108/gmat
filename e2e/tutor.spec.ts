// The tutor in a real browser, with Claude's service replaced by a stand-in that answers the way the
// real one does (streamed). The robot connects a key, has a first session, asks about a question from
// the error log with a photo, approves the homework the tutor sets, finds it in the week, and tries
// with no signal. Every request the app sends is checked.

import { expect, test, type Route } from "@playwright/test";
import fs from "node:fs";
import type { Content } from "../src/core/content";
import { buildModel } from "../src/core/model";
import { sse, textReply, toolReply } from "../tests/sse";
import { CONTENT, at, firstWeek, hasContent, jumpTo, launch, profileDir, resetAlbum, seed, setPrefix, setStep, settled, snap, writeAlbum } from "./helpers";

test.skip(!hasContent(), "needs data/gmat-content-v1.json (run `npm run content`)");

const notes: string[] = [];
let passed = false;
test.beforeAll(() => { resetAlbum(); setPrefix("tutor-"); });
test.afterAll(() => writeAlbum("The tutor, tested by a robot", passed, notes, "album-tutor.html"));

// a 2×2 PNG, standing in for a phone photo of the question
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQI12P8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==", "base64");

test("the tutor, end to end", async () => {
  const content = JSON.parse(fs.readFileSync(CONTENT, "utf-8")) as Content;
  const bot = firstWeek(content);
  const { ctx, page } = await launch(profileDir("tutor"), at("2026-12-05T20:30"));

  // Claude's service, stood in for: each request gets the next reply; every request is kept
  const requests: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const replies: object[][] = [];
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
  await ctx.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    requests.push({ body: JSON.parse(req.postData() ?? "{}"), headers: req.headers() });
    const next = replies.shift() ?? textReply("OK.");
    return route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body: sse(next as never) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Use it anyway/ }).click();
  await page.locator("input[type=file]").setInputFiles(CONTENT);
  await expect(page.getByText("Here's the shape of it.")).toBeVisible();
  await seed(page, bot.events);
  await page.reload();
  await settled(page);

  setStep("1 · Connect the tutor");
  await page.goto("/#/tutor");
  await expect(page.getByText("Connect your tutor")).toBeVisible();
  await snap(page, "The tutor is Claude, on your own key. The key stays in this browser: never in a backup, the code or the website.");
  await page.getByPlaceholder("sk-ant-…").fill("sk-ant-test-key-for-the-robot");
  await page.getByRole("button", { name: "Save the key" }).click();
  await expect(page.getByText("Your tutor", { exact: true })).toBeVisible();
  await snap(page, "Sessions on the left: explain a question, teach a topic, weekly check-in, mock debrief, strategy and nerves, get to know me.");

  setStep("2 · A first session: getting to know you");
  replies.push(toolReply("save_note", { note: "Aiming for 685; quant is the worry; likes one worked example, then a try." }, "Thanks, that helps."),
    textReply("Got it. Here's how we'll work: I'll start every topic from **your own mistakes**, give you one worked example, then one official question to try.\n\n1. Mornings: quant and DI.\n2. Rides: reading, CR and cards.\n\nWhat do you find hardest right now?"));
  await page.getByRole("button", { name: 'Start with "Get to know me"' }).click();
  await page.getByPlaceholder(/Ask anything/).fill("I'm aiming for 685. Quant scares me.");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/What do you find hardest right now\?/)).toBeVisible();
  await expect(page.getByText(/✓ Noted: Aiming for 685/)).toBeVisible();
  await snap(page, "The tutor replies as it writes. What it learns about you is noted for every later session.");
  const intake = requests[0];
  expect(intake.body.model).toBe("claude-opus-5-5");
  expect(intake.body.fallbacks).toBe("default");
  expect(intake.headers["x-api-key"]).toBe("sk-ant-test-key-for-the-robot");
  expect(String((intake.body.system as { text: string }[])[1].text)).toMatch(/getting to know the student/);
  expect(String((intake.body.system as { text: string }[])[2].text)).toMatch(/# The student, today/);

  setStep("3 · Ask about a question from the error log, with a photo; approve the homework");
  await jumpTo(ctx, page, at("2026-12-08T08:30"));
  const m = buildModel(content, bot.events, new Date("2026-12-08T08:30"));
  const it = [...m.reviews.items.values()].find((x) => x.source === "book" && x.firstMark === "wrong")!;
  await page.goto(`/#/tutor?ctx=${encodeURIComponent(`item:${it.id}`)}`);
  await settled(page);
  await expect(page.getByPlaceholder(/Ask anything/)).toHaveValue(/Can you go through this one with me\?/);
  await expect(page.getByText(/Add a photo of the question/)).toBeVisible();
  await snap(page, "Started from a question in the review: your answers are filled in. Its answer stays hidden until your retry, so the tutor gives hints only.");
  await page.locator("input[type=file][accept='image/*']").setInputFiles({ name: "question.png", mimeType: "image/png", buffer: PHOTO });
  await expect(page.getByText("photo 1 ×")).toBeVisible();
  replies.push(toolReply("assign_official_questions", { title: "Percents, a second look", book: "og", numbers: [it.n! + 1, it.n! + 2], reason: "Two like this one, to try the method on." },
    "Here's a hint first: what is the percent **of**? Write the base before you write anything else."),
    textReply("Added. Try them tomorrow morning; the app brings them back for review after."));
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Homework from your tutor")).toBeVisible();
  await snap(page, "Hints, then homework: official questions only, and nothing goes into your week until you say so.");
  await page.getByRole("button", { name: "Add to my week" }).click();
  await expect(page.getByText(/✓ Added to this week: Percents, a second look/)).toBeVisible();
  const lastUser = (r: (typeof requests)[number]) => (r.body.messages as { role: string; content: { type: string }[] | string }[]).filter((x) => x.role === "user").pop()!;
  const photoReq = requests.find((r) => Array.isArray(lastUser(r).content) && (lastUser(r).content as { type: string }[]).some((b) => b.type === "image"))!;
  expect((lastUser(photoReq).content as { type: string }[]).map((b) => b.type)).toEqual(["image", "text", "text"]);
  expect(JSON.stringify(lastUser(photoReq).content)).toContain(`[context for the tutor] error-log item id ${it.id}`);
  await expect(page.getByText(`item id ${it.id}`)).toHaveCount(0);       // the id is for the tutor, not shown to you
  const brief = String((photoReq.body.system as { text: string }[])[2].text);
  const line = brief.split("\n").find((l) => l.includes(`[${it.id}]`)) ?? "";
  expect(line).not.toMatch(/answer/i);          // the brief never carries an answer
  notes.push(`The tutor's requests: ${requests.length}; every one used claude-opus-5-5 with the server-side fallback, and the photo went as an image block.`);

  await page.goto("/#/week");
  await expect(page.getByRole("button", { name: /Percents, a second look/ })).toBeVisible();
  await snap(page, "The homework is in the week like any other chip, marked from the answer key and reviewed 1–3 days later.");

  setStep("4 · No signal");
  await page.goto("/#/tutor");
  await page.getByRole("button", { name: "Teach me a topic" }).click();
  await ctx.setOffline(true);
  await page.getByPlaceholder(/Ask anything/).fill("Teach me rates?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/No signal right now\. Your message is kept here/)).toBeVisible();
  await snap(page, "On the bus with no signal: the tutor waits, the message is kept, everything else works offline.");
  await ctx.setOffline(false);

  setStep("5 · The tutor in Settings");
  await page.goto("/#/settings");
  await expect(page.getByText(/This month: \$\d+\.\d\d of \$15/)).toBeVisible();
  await page.getByText("Your tutor").scrollIntoViewIfNeeded();
  await snap(page, "Settings: the key (last four characters only), a monthly cap, how hard it thinks, and what it's cost this month.");

  await ctx.close();
  passed = true;
});
