// A simulated student for the model: studies in the morning slots, on Saturdays and on the bus,
// answers about three in four right, and does whatever the card offers. Used to fast-forward weeks
// and months (build prompt: Phase 2 and 3 checks) and to check the rules that must always hold.

import { chooseCard, type Card } from "../src/core/card";
import { sessionCards } from "../src/core/cards";
import type { Content } from "../src/core/content";
import type { AppEvent, EventBody, Tag } from "../src/core/events";
import { markOne } from "../src/core/grid";
import { topupOffers } from "../src/core/adapt";
import { buildModel, cardContext, upkeep, type Model } from "../src/core/model";
import type { Piece } from "../src/core/pieces";

export interface DayPlan { morning: boolean; saturday: boolean; bus: boolean }

export class Bot {
  events: AppEvent[] = [];
  private n = 0;
  private rnd: () => number;
  cardsSeen: { when: string; card: Card["kind"]; title: string; bus: boolean; deskOnly: boolean; group: string }[] = [];
  snapshots: { day: string; pct: number; hours: number; weeks: number; level: number; retired: number }[] = [];

  section: string = "quant";
  difficulty: string | null = null;
  topups = 0;
  /** Optional: a learning student. Accuracy from the section and the question's difficulty, right now. */
  accuracyFn?: (section: string, difficulty: string | null) => number;
  /** Optional: scores for an official mock, from the student's ability at the time. */
  mockScores?: (p: Piece, t: Date) => Record<string, number>;
  /** Minutes of work per section (reviews, redos and cards included), for a learning model. */
  minutes: Record<string, number> = {};
  constructor(public content: Content, seed = 7, public accuracy = 0.75, public bySection: Record<string, number> = {}) {
    let s = seed;
    this.rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  }

  rec(t: Date, body: EventBody): void {
    const ts = Math.max(t.getTime(), (this.events[this.events.length - 1]?.ts ?? 0) + 1);
    const sd = new Date(ts - 4 * 3_600_000);
    const p = (x: number) => String(x).padStart(2, "0");
    this.events.push({ ...body, id: `b${this.n++}`, ts, day: `${sd.getFullYear()}-${p(sd.getMonth() + 1)}-${p(sd.getDate())}` } as AppEvent);
  }

  model(t: Date, online = true): Model {
    // the app records its own upkeep whenever it opens
    for (let i = 0; i < 6; i++) {
      const m = buildModel(this.content, this.events, t, online);
      const todo = upkeep(m);
      if (!todo.length) return m;
      for (const e of todo) this.rec(t, e);
    }
    return buildModel(this.content, this.events, t, online);
  }

  setup(t: Date) {
    this.rec(t, { type: "dayone", step: "accepted", ok: true, detail: "risk" });
    this.rec(t, { type: "setup.done" });
  }

  private acc() { return this.accuracyFn ? this.accuracyFn(this.section, this.difficulty) : this.bySection[this.section] ?? this.accuracy; }
  private spend(section: string, minutes: number) { this.minutes[section] = (this.minutes[section] ?? 0) + minutes; }
  private letter(key: unknown): string {
    const right = this.rnd() < this.acc();
    if (right && typeof key === "string") return key;
    const all = ["A", "B", "C", "D", "E"].filter((x) => x !== key);
    return all[Math.floor(this.rnd() * all.length)];
  }
  private answerFor(key: unknown): string | number[] {
    if (Array.isArray(key)) return this.rnd() < this.acc() ? key : [key[0], (key[1] % 5) + 1];
    return this.letter(key);
  }

  /** One sitting from `start` for `minutes`. Returns what was done. */
  session(start: Date, minutes: number, bus: boolean): string[] {
    let t = new Date(start);
    const end = start.getTime() + minutes * 60_000;
    const did: string[] = [];
    if (bus) this.rec(t, { type: "bus", on: true });
    for (let guard = 0; guard < 12 && t.getTime() < end - 5 * 60_000; guard++) {
      const m = this.model(t);
      const { ctx } = cardContext(m, { bus, online: true });
      const card = chooseCard(ctx);
      const piece = "piece" in card ? (card.piece as Piece) : null;
      this.cardsSeen.push({ when: t.toISOString(), card: card.kind, title: piece?.task.title ?? card.kind, bus, deskOnly: !!piece?.deskOnly, group: piece?.group ?? "" });
      const used = this.act(m, card, t, bus);
      if (used === 0) break;
      did.push(card.kind + (piece ? `:${piece.id}` : ""));
      t = new Date(t.getTime() + used * 60_000);
    }
    if (bus) this.rec(t, { type: "bus", on: false });
    const m = this.model(t);
    this.snapshots.push({ day: m.today, pct: m.pct, hours: Math.floor(m.d.totalMinutes / 60), weeks: m.d.counted.size, level: m.level, retired: m.reviews.retired });
    return did;
  }

  /** Do what the card says; returns minutes used (0 = nothing to do). */
  act(m: Model, card: Card, t: Date, bus: boolean): number {
    const where = bus ? "bus" as const : "desk" as const;
    switch (card.kind) {
      case "task": case "resume": case "redo": case "mock": return this.doPiece(m, card.piece, t, where);
      case "review": case "resumeReview": return this.doReview(m, card.kind === "review" ? card.set.id : card.review, t, where);
      case "mixed": return this.doMixed(m, card.items.map((x) => x.id), t, where);
      case "cards": case "back": {
        if (card.kind === "back") this.rec(t, { type: "seen", what: `back:${m.today}` });
        const cs = sessionCards(m.cards, t.getTime());
        for (const c of cs) this.rec(t, { type: "card.rated", card: c.id, rating: this.rnd() < 0.8 ? "good" : "again" });
        this.rec(t, { type: "cards.session", count: cs.length, where });
        this.spend("cards", 10);
        this.rec(t, { type: "time", minutes: 10, where, source: "cards" });
        return cs.length ? 10 : 0;
      }
      case "end": if (card.phase === "checklist") { this.rec(t, { type: "seen", what: "checklist" }); return 1; } return 0;
      default: return 0;
    }
  }

  doPiece(m: Model, p: Piece, t: Date, where: "desk" | "bus"): number {
    const k = p.task.kind;
    this.section = p.section;
    if (!m.d.started.has(p.id)) this.rec(t, { type: "piece.started", piece: p.id, mode: where });
    const books = this.content.book_keys.books;
    if (k === "og_set" && p.numbers) {
      const book = p.task.pointer.book ?? "og";
      for (let n = p.numbers[0]; n <= p.numbers[1]; n++) {
        const bq = books[book]?.questions.find((q) => q.n === n);
        const key = bq?.answer;
        this.difficulty = bq?.difficulty?.toLowerCase() ?? null;
        this.rec(t, { type: "answer", piece: p.id, q: n, value: this.answerFor(key), unsure: this.rnd() < 0.1, sinceStartMs: (n - p.numbers[0] + 1) * 110_000 });
      }
      this.rec(t, { type: "piece.submitted", piece: p.id, wrongOrUnsure: 0, answered: p.numbers[1] - p.numbers[0] + 1 });
    } else if (k === "rc_section") {
      const sec = this.content.rc_bank.sections.find((s) => s.id === p.task.pointer.section);
      const only = p.task.pointer.passages as number[] | undefined;
      sec?.passages.forEach((pa, i) => { if (only && !only.includes(i)) return; pa.questions.forEach((q) => this.rec(t, { type: "answer", piece: p.id, q: q.id, value: this.letter(q.answer), unsure: false, sinceStartMs: 0 })); });
      this.rec(t, { type: "piece.submitted", piece: p.id, wrongOrUnsure: 0, answered: 1 });
    } else if (k === "cr_set") {
      const set = [...this.content.cr_bank.default_sets, ...this.content.cr_bank.reserve_sets].find((s) => s.id === p.task.pointer.set);
      for (const q of set?.questions ?? []) this.rec(t, { type: "answer", piece: p.id, q: q.n, value: "ABCDE"[q.n % 5], unsure: this.rnd() < 0.15, sinceStartMs: 0 });
      this.rec(t, { type: "piece.submitted", piece: p.id, wrongOrUnsure: 0, answered: set?.questions.length ?? 0 });
    } else if (k === "drill") {
      const tgt = p.task.target;
      this.rec(t, { type: "drill", piece: p.id, go: 1, right: tgt ? (this.rnd() < 0.5 ? tgt.count : tgt.count - 2) : 8, total: tgt?.count ?? 10, seconds: 600, met: this.rnd() < 0.5 });
    } else if (k === "gmatclub_set" || k === "di_set" || (k === "mock" && p.task.pointer.type !== "official_mock")) {
      const c = p.count ?? 10;
      const right = Math.round(c * this.acc());
      this.rec(t, { type: "outside", piece: p.id, right, wrong: c - right, unsure: 0 });
    } else if (k === "mock") {
      this.rec(t, { type: "outside", piece: p.id, scores: this.mockScores?.(p, t) ?? { total: 615, quant: 78, verbal: 84, di: 74 } });
    } else if (k === "admin") {
      this.rec(t, { type: "admin", piece: p.id, answer: "done" });
    }
    this.difficulty = null;
    this.spend(p.section, k === "mock" ? 135 : p.minutes);
    this.rec(t, { type: "time", minutes: k === "mock" ? 135 : p.minutes, where, piece: p.id, source: k });
    this.rec(t, { type: "piece.done", piece: p.id });
    return k === "mock" ? 135 : Math.max(5, p.minutes);
  }

  doReview(m: Model, id: string, t: Date, where: "desk" | "bus"): number {
    const s = m.reviews.setById.get(id);
    if (!s) return 0;
    if (!m.d.reviewStarted.has(id)) this.rec(t, { type: "review.started", review: id, items: s.items.map((x) => x.id) });
    if (s.path === "fallback") {
      for (const it of s.items.filter((x) => x.firstUnsure)) this.rec(t, { type: "review.answer", review: id, item: it.id, attempt: "retry", value: "C" });
      for (const it of s.all) this.rec(t, { type: "key.entered", key: it.source === "cr" ? `cr:${it.url}` : `book:${it.book}:${it.n}`, value: "ABCDE"[(it.n ?? 0) % 5 === 0 ? 1 : (it.n ?? 1) % 5] });
    } else {
      for (const it of s.items) {
        const right = this.rnd() < 0.6;
        const value = right && it.key ? it.key : this.answerFor(it.key);
        this.rec(t, { type: "review.answer", review: id, item: it.id, attempt: "retry", value });
      }
    }
    const after = buildModel(this.content, this.events, t).reviews.setById.get(id)!;
    const tags: Tag[] = after.group === "Q" ? ["concept", "process", "careless", "timing"] : ["not supported", "out of scope"];
    for (const it of after.items.filter((x) => x.needsTag)) {
      const tag = tags[Math.floor(this.rnd() * tags.length)];
      this.rec(t, { type: "review.tag", item: it.id, tag, line: this.rnd() < 0.3 ? "Read what's asked first" : undefined });
    }
    this.rec(t, { type: "review.done", review: id });
    this.spend(s.section, s.minutes);
    this.rec(t, { type: "time", minutes: s.minutes, where, source: "review" });
    // the close offers a top-up after a rough set: take every other one
    const m2 = buildModel(this.content, this.events, t);
    const s2 = m2.reviews.setById.get(id)!;
    for (const o of topupOffers(s2.all, m2.reviews, m2.adapt.history(m2.weekStart))) {
      const spec = m2.adapt.topupSpec(o, m2.weekStart);
      if (spec && this.rnd() < 0.5 && !m2.d.extras.has(spec.id)) { this.rec(t, { type: "extra.added", extra: spec }); this.topups++; }
    }
    return Math.max(5, s.minutes);
  }

  doMixed(_m: Model, ids: string[], t: Date, where: "desk" | "bus"): number {
    const id = `mixed:${this.n}`;
    this.rec(t, { type: "review.started", review: id, items: ids });
    const m = buildModel(this.content, this.events, t);
    for (const x of ids) {
      const it = m.reviews.items.get(x)!;
      this.section = it.section;
      const right = this.rnd() < Math.min(0.9, this.acc() + 0.1);
      if (it.source === "share") { this.rec(t, { type: "review.answer", review: id, item: x, attempt: "mixed", value: null, right }); continue; }
      if (it.key === undefined) this.rec(t, { type: "key.entered", key: it.source === "cr" ? `cr:${it.url}` : `book:${it.book}:${it.n}`, value: "B" });
      const key = it.key ?? "B";
      const value = right ? key : this.answerFor(key);
      void markOne;
      this.rec(t, { type: "review.answer", review: id, item: x, attempt: "mixed", value });
    }
    this.rec(t, { type: "review.done", review: id });
    for (const x of ids) this.spend(m.reviews.items.get(x)!.section, 3);
    this.rec(t, { type: "time", minutes: ids.length * 3, where, source: "mixed review" });
    return Math.max(5, ids.length * 3);
  }
}

export const at = (s: string) => new Date(s);
