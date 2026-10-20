// A small content file for the review, cards and model tests: one OG block of 6, one LSAT reading set
// (2 passages × 3 questions), one CR set of 5, two drills' worth of plan, two starter decks.

import type { Content, Task } from "../src/core/content";
import type { AppEvent, EventBody } from "../src/core/events";
import { task } from "./helpers";

export const OG_KEY = ["A", "B", "C", "D", "E", "A"];

export function fixtureContent(extraTasks: Task[] = []): Content {
  const og: Task = task({
    id: "og1", section: "quant", kind: "og_set", plan_week: 1, est_minutes: 20, review_minutes: 10,
    pointer: { type: "og_block", book: "og", qtype: "PS", numbers: [1, 6], count: 6 },
  });
  const rc: Task = task({ id: "rc1", section: "rc", kind: "rc_section", plan_week: 1, est_minutes: 40, offline_ok: true, review_minutes: 10, pointer: { type: "lsat_rc", section: "s1", count: 6 } });
  const cr: Task = task({ id: "cr1", section: "cr", kind: "cr_set", plan_week: 1, est_minutes: 30, review_minutes: 10, pointer: { type: "lsat_cr", set: "c1", count: 5 } });
  const gc: Task = { ...task({ id: "gc1", section: "quant", kind: "gmatclub_set", plan_week: 1, est_minutes: 30 }), topic: "percents", pointer: { type: "gmatclub_list", lists: { easy: "https://gmatclub.com/forum/search.php?pct-easy", mixed: "https://gmatclub.com/forum/search.php?pct-mixed" }, count: 10 } };
  const vid: Task = task({ id: "v1", section: "quant", kind: "video", plan_week: 1, est_minutes: 10, title: "More Percents", pointer: { type: "video", youtube_id: "abcdefghijk", url: "https://www.youtube.com/watch?v=abcdefghijk" } });
  const careless: Task = task({ id: "w01-quant-01", section: "quant", kind: "video", plan_week: 1, est_minutes: 8, title: "Why careless errors cost so much", pointer: { type: "video", youtube_id: "6NejHz-JL5U", url: "https://www.youtube.com/watch?v=6NejHz-JL5U" } });
  const passage = (id: string, topic: string, ans: string[]) => ({
    id, topic, paragraphs: ["A passage."],
    questions: ans.map((a, i) => ({ id: `${id}q${i + 1}`, n: i + 1, stem: `Q${i + 1}?`, choices: { A: "a", B: "b", C: "c", D: "d", E: "e" }, answer: a, type: i === 0 ? "main idea" : "inference", line_ref: false })),
  });
  return {
    format: "gmat-content", version: "test",
    plan: { tasks: [careless, vid, og, rc, cr, gc, ...extraTasks], settings_defaults: {}, section_text: {}, help: [] },
    rc_bank: { sections: [{ id: "s1", source: "LSAT 01 SECTION I", question_count: 6, passages: [passage("p1", "law", ["A", "B", "C"]), passage("p2", "science", ["D", "E", "A"])] },
      { id: "s2", source: "LSAT 02 SECTION I", question_count: 3, passages: [passage("p3", "humanities", ["A", "A", "A"])] }] },
    cr_bank: {
      default_sets: [{ id: "c1", label: "LSAT 1 · I", size: 5, questions: [1, 2, 3, 4, 5].map((n) => ({ n, url: `https://gmatclub.com/forum/cr-q${n}-1000${n}.html` })) }],
      reserve_sets: [{ id: "gc-a", label: "Reserve A", size: 2, questions: [1, 2].map((n) => ({ n, url: `https://gmatclub.com/forum/reserve-${n}-2000${n}.html` })) }],
      has_official_answers: false,
    },
    book_keys: { books: {
      og: { meta: { book: "og", name: "Official Guide", edition: "2025–2026" }, questions: OG_KEY.map((a, i) => ({ n: i + 1, section: "PS", answer: a, concept: i < 3 ? "Percents" : "Statistics", page: 80 + Math.floor(i / 2) })) },
      qr: { meta: { book: "qr", name: "QR", edition: null }, questions: [] },
      vr: { meta: { book: "vr", name: "VR", edition: null }, questions: [] },
      dir: { meta: { book: "dir", name: "DIR", edition: null }, questions: [] },
    } },
    links: { links: [] },
    benchmarks: { rules: [
      { week: 1, section: "quant", guide_link: "https://gmatclub.com/forum/week-1.html", careless_max_share: 0.05, accuracy: { og: { great: [80, 90], fine: [70, 80] } }, time: { quant: { target_s: 120, flag_s: 150 } } },
      { week: 1, section: "rc", guide_link: null, accuracy: { lsat: { target: [70, 80] } }, time: { lsat_set_25: { target_min: 60 } } },
      { week: 8, section: "mock", guide_link: null, gap_below_665: [50, 50] },
      { week: 11, section: "mock", guide_link: null, gap_below_665: [20, 30] },
    ] },
    decks: {
      quant_facts: Array.from({ length: 40 }, (_, i) => ({ id: `qf${i}`, front: `${i}²`, back: String(i * i) })),
      method: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, front: `Method ${i}`, back: `Do ${i}` })),
    },
  };
}

/** An event log written by hand: each entry happens at a local time ("2026-12-05T10:05"). */
export class Log {
  events: AppEvent[] = [];
  private n = 0;
  at(when: string, body: EventBody): this {
    const t = new Date(when);
    const ts = Math.max(t.getTime(), (this.events[this.events.length - 1]?.ts ?? 0) + 1);
    const shifted = new Date(ts - 4 * 3_600_000);
    const p = (x: number) => String(x).padStart(2, "0");
    const day = `${shifted.getFullYear()}-${p(shifted.getMonth() + 1)}-${p(shifted.getDate())}`;
    this.events.push({ ...body, id: `e${this.n++}`, ts, day } as AppEvent);
    return this;
  }
  /** Answer a book half-set in one go: letters with "s" for not sure. */
  grid(when: string, piece: string, from: number, letters: string[]): this {
    letters.forEach((l, i) => this.at(when, { type: "answer", piece, q: from + i, value: l.replace("s", "").toUpperCase() || null, unsure: l.endsWith("s"), sinceStartMs: (i + 1) * 100_000 }));
    return this;
  }
}
