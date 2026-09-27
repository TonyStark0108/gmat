// Today's mix: which option carries the "Recommended" label (spec: How the recommendation is picked).
// The first rule that matches wins; it's worked out every time the app opens.

import { DAY_NAMES, daysBetween, parseYmd } from "./calendar";
import type { MixChoice } from "./events";

export type MixSection = "quant" | "verbal" | "di";
export const MIX_NAMES: Record<MixSection, string> = { quant: "Quant", verbal: "Verbal", di: "DI" };

export interface MixCtx {
  today: string;
  remaining: Record<MixSection, number>;                 // minutes of this week's work still to do
  studyDaysLeft: number;                                 // days left this week with time in them, today included
  waiting: Record<MixSection, { redos: number; topUp: boolean }>;
  lastSeen: Record<MixSection, string | null>;           // last day each section came up
  lastSessionChoice: { day: string; choice: MixChoice } | null;   // the most recent earlier study day
  planStarted: string;                                   // first day of the plan
  minutesToday: number | null;                           // the time chip, if set
}

export interface MixRec { choice: MixChoice; first?: MixSection; reason: string | null }

const SECTIONS: MixSection[] = ["quant", "verbal", "di"];

export function recommendMix(c: MixCtx): MixRec {
  const withWork = SECTIONS.filter((s) => c.remaining[s] > 0);
  // "Just" is never recommended two days in a row.
  const yesterdayJust = c.lastSessionChoice && c.lastSessionChoice.choice !== "mix" ? c.lastSessionChoice.choice : null;
  const justAllowed = !yesterdayJust;

  // A 30-minute session gets one section: split three ways it's too thin.
  if (c.minutesToday !== null && c.minutesToday <= 30 && withWork.length) {
    const s = [...withWork].sort((a, b) => c.remaining[b] - c.remaining[a])[0];
    return { choice: s, reason: "Thirty minutes goes further on one section." };
  }

  // 1. One section holds most of the week's remaining work, with three or fewer days left.
  const total = withWork.reduce((n, s) => n + c.remaining[s], 0);
  if (justAllowed && c.studyDaysLeft <= 3 && total > 0) {
    const big = withWork.find((s) => c.remaining[s] > total / 2);
    if (big) return { choice: big, reason: `${MIX_NAMES[big]} has most of this week's work left.` };
  }

  // 2. A top-up, or several redos, waiting in one section.
  if (justAllowed) {
    const s = SECTIONS.find((x) => c.waiting[x].topUp || c.waiting[x].redos >= 3);
    if (s) {
      const w = c.waiting[s];
      const reason = w.topUp && w.redos < 3
        ? `A ${MIX_NAMES[s]} top-up is waiting. Clear it in one go.`
        : `${w.redos} ${MIX_NAMES[s]} redos are due. Clear them in one go.`;
      return { choice: s, reason };
    }
  }

  // 3. A section that hasn't come up for three days goes first in the mix.
  if (daysBetween(c.planStarted, c.today) >= 3) {
    for (const s of withWork) {
      const last = c.lastSeen[s];
      if (last === null) return { choice: "mix", first: s, reason: `${MIX_NAMES[s]} hasn't come up yet.` };
      if (daysBetween(last, c.today) >= 3) {
        return { choice: "mix", first: s, reason: `${MIX_NAMES[s]} hasn't come up since ${DAY_NAMES[parseYmd(last).getDay()]}.` };
      }
    }
  }

  // 4. Yesterday was "Just" one section.
  if (yesterdayJust) {
    return { choice: "mix", reason: `Yesterday was all ${yesterdayJust === "di" ? "DI" : yesterdayJust}. Mix it up today.` };
  }

  // 5. The usual: a bit of everything, no reason line.
  return { choice: "mix", reason: null };
}

export function sectionOfMix(section: string): MixSection | null {
  if (section === "quant") return "quant";
  if (section === "di") return "di";
  if (section === "rc" || section === "cr") return "verbal";
  return null;
}
