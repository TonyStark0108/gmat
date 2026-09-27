import { describe, expect, it } from "vitest";
import { recommendMix, type MixCtx } from "../src/core/mix";

const base = (p: Partial<MixCtx> = {}): MixCtx => ({
  today: "2027-01-14",               // a Thursday
  remaining: { quant: 100, verbal: 90, di: 80 },
  studyDaysLeft: 5,
  waiting: { quant: { redos: 0, topUp: false }, verbal: { redos: 0, topUp: false }, di: { redos: 0, topUp: false } },
  lastSeen: { quant: "2027-01-13", verbal: "2027-01-13", di: "2027-01-13" },
  lastSessionChoice: { day: "2027-01-13", choice: "mix" },
  planStarted: "2026-12-01",
  minutesToday: null,
  ...p,
});

describe("test 6 · the recommendation switch", () => {
  it("rule 1: most of the week's work in one section, 3 or fewer days left", () => {
    const r = recommendMix(base({ remaining: { quant: 300, verbal: 50, di: 40 }, studyDaysLeft: 3 }));
    expect(r).toEqual({ choice: "quant", reason: "Quant has most of this week's work left." });
  });

  it("rule 1 needs 3 or fewer days left", () => {
    expect(recommendMix(base({ remaining: { quant: 300, verbal: 50, di: 40 }, studyDaysLeft: 4 })).choice).toBe("mix");
  });

  it("rule 2: several redos waiting in one section", () => {
    const r = recommendMix(base({ waiting: { quant: { redos: 0, topUp: false }, verbal: { redos: 0, topUp: false }, di: { redos: 4, topUp: false } } }));
    expect(r).toEqual({ choice: "di", reason: "4 DI redos are due. Clear them in one go." });
  });

  it("rule 2: a top-up waiting", () => {
    const r = recommendMix(base({ waiting: { quant: { redos: 0, topUp: true }, verbal: { redos: 0, topUp: false }, di: { redos: 0, topUp: false } } }));
    expect(r.choice).toBe("quant");
  });

  it("rule 1 wins over rule 2", () => {
    const r = recommendMix(base({ remaining: { quant: 300, verbal: 50, di: 40 }, studyDaysLeft: 2,
      waiting: { quant: { redos: 0, topUp: false }, verbal: { redos: 0, topUp: false }, di: { redos: 5, topUp: false } } }));
    expect(r.choice).toBe("quant");
  });

  it("rule 3: a section unseen for 3 days goes first in the mix", () => {
    const r = recommendMix(base({ lastSeen: { quant: "2027-01-13", verbal: "2027-01-11", di: "2027-01-13" } }));
    expect(r).toEqual({ choice: "mix", first: "verbal", reason: "Verbal hasn't come up since Monday." });
  });

  it("rule 4: yesterday was 'Just' one section", () => {
    const r = recommendMix(base({ lastSessionChoice: { day: "2027-01-13", choice: "quant" } }));
    expect(r).toEqual({ choice: "mix", reason: "Yesterday was all quant. Mix it up today." });
  });

  it("rule 5: anything else is a bit of everything, with no reason line", () => {
    expect(recommendMix(base())).toEqual({ choice: "mix", reason: null });
  });

  it("'Just' is never recommended two days running", () => {
    const r = recommendMix(base({ remaining: { quant: 300, verbal: 50, di: 40 }, studyDaysLeft: 2,
      lastSessionChoice: { day: "2027-01-13", choice: "quant" } }));
    expect(r.choice).toBe("mix");
  });

  it("a 30-minute session gets one section", () => {
    const r = recommendMix(base({ minutesToday: 30 }));
    expect(r.choice).toBe("quant");
  });
});
