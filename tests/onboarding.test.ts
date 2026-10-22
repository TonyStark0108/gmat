// The welcome and the tour keep the tone rules, and every tour step points at something on home.

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_TOUR, SLIDES } from "../src/ui/Onboarding";

const BANNED = /\b(behind|overdue|failed|missed|broken|late|reset|should|must|still|only)\b|you haven't|spaced repetition|interleaving|active recall|pomodoro/i;

describe("getting started", () => {
  it("the welcome and the tour keep the tone rules", () => {
    for (const s of SLIDES) expect(`${s.title} ${s.body}`, s.title).not.toMatch(BANNED);
    for (const s of HOME_TOUR) expect(`${s.title} ${s.body}`, s.title).not.toMatch(BANNED);
  });

  it("every tour step points at a place marked on home", () => {
    const home = fs.readFileSync("src/ui/Home.tsx", "utf8");
    for (const s of HOME_TOUR) expect(home, s.target).toContain(`data-tour="${s.target}"`);
  });
});
