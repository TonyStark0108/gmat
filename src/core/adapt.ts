// Adapting to you (spec: Adapting to you). The app measures each topic, then quietly shifts the free
// 15%, the topics and the difficulty toward where you're weak. It changes slowly: nothing moves for a
// topic until it has 15 attempts, one change per section per week, never more than 15 hours a week,
// and no predicted score. The visible signs are one Sunday line and the order of "What to work on".

import { daysBetween, plusDays } from "./calendar";
import type { Content, Section } from "./content";
import type { Tag } from "./events";
import type { Piece } from "./pieces";
import type { Item, ReviewModel } from "./review";
import type { Derived } from "./state";
import { DI_TYPE_OF, listTopic } from "./topics";
import { MSR_LIST } from "./planFixes";

export const ADAPT_MIN_ATTEMPTS = 15;
export const RECENT = 20;

export interface TopicStat {
  topic: string;
  section: Section;
  attempts: number;
  accuracy: number;            // first try, the last 20, recent ones counting more
  redoAccuracy: number | null;
  inReview: number;
  reviewWeight: number;        // errors still in review, recent ones weighted more
  tags: Partial<Record<Tag, number>>;
  sets: { day: string; accuracy: number; n: number }[];
}

const isSlip = (t: Tag) => t === "careless" || t === "timing";

function weighted(marks: boolean[]): number {
  const last = marks.slice(-RECENT);
  let w = 0, s = 0;
  last.forEach((m, i) => { const k = i + 1; w += k; if (m) s += k; });
  return w ? s / w : 0;
}

export function topicStats(reviews: ReviewModel, d: Derived, pieces: Map<string, Piece>, today: string): Map<string, TopicStat> {
  const firsts = new Map<string, { day: string; right: boolean; set: string }[]>();
  const meta = new Map<string, Section>();
  const add = (topic: string, section: Section, day: string, right: boolean, set: string) => {
    firsts.set(topic, [...(firsts.get(topic) ?? []), { day, right, set }]);
    if (!meta.has(topic)) meta.set(topic, section);
  };
  for (const it of reviews.items.values()) {
    if (it.source === "share" || it.firstMark === "unknown") continue;
    add(it.topic, it.section, it.setDay, it.firstMark === "right", it.review);
  }
  // GMAT Club sets give counts by topic (no single questions)
  for (const [pid, o] of d.outside) {
    const p = pieces.get(pid);
    if (!p) continue;
    const day = d.doneAt.get(pid)?.day ?? today;
    const count = (topic: string, c: { right?: number; wrong?: number; unsure?: number }) => {
      for (let i = 0; i < (c.right ?? 0); i++) add(topic, p.section, day, true, pid);
      for (let i = 0; i < (c.wrong ?? 0) + (c.unsure ?? 0); i++) add(topic, p.section, day, false, pid);
    };
    if (o.byType) { for (const [t, c] of Object.entries(o.byType)) count(DI_TYPE_OF[t] ?? t, c); continue; }
    const types = p.task.pointer.types as string[] | undefined;
    const topic = p.task.topic ? listTopic(p.task.topic) : types?.length === 1 ? DI_TYPE_OF[types[0]] : null;
    if (!topic || o.right === undefined) continue;
    count(topic, o);
  }
  const out = new Map<string, TopicStat>();
  for (const [topic, fs] of firsts) {
    fs.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    const its = [...reviews.items.values()].filter((it) => it.topic === topic && it.entered);
    const redo = its.filter((it) => it.attempts > 0);
    const redoRight = redo.filter((it) => it.state === "return" || it.state === "retired");
    const live = its.filter((it) => it.state === "review" || it.state === "redo" || it.state === "return" || it.state === "stubborn");
    const tags: TopicStat["tags"] = {};
    for (const it of its) if (it.tag) tags[it.tag] = (tags[it.tag] ?? 0) + 1;
    const bySet = new Map<string, { day: string; r: number; n: number }>();
    for (const f of fs) { const x = bySet.get(f.set) ?? { day: f.day, r: 0, n: 0 }; x.n++; if (f.right) x.r++; bySet.set(f.set, x); }
    out.set(topic, {
      topic, section: meta.get(topic)!, attempts: fs.length, accuracy: weighted(fs.map((f) => f.right)),
      redoAccuracy: redo.length ? redoRight.length / redo.length : null, inReview: live.length,
      reviewWeight: live.reduce((s, it) => s + 1 / (1 + Math.max(0, daysBetween(it.setDay, today)) / 14), 0),
      tags, sets: [...bySet.values()].map((x) => ({ day: x.day, accuracy: x.r / x.n, n: x.n })),
    });
  }
  return out;
}

export type AdaptSection = "quant" | "di" | "rc" | "cr";

/** First-try accuracy per section, from desk sets only (a tired ride isn't a fair reading). */
export function sectionStats(reviews: ReviewModel, d: Derived): Map<AdaptSection, { attempts: number; accuracy: number; sets: number[] }> {
  const out = new Map<AdaptSection, { attempts: number; accuracy: number; sets: number[] }>();
  for (const s of reviews.sets) {
    const sec = (s.section === "general" || s.section === "mock" ? null : s.section) as AdaptSection | null;
    if (!sec) continue;
    const onBus = [...new Set(s.all.map((it) => it.pieceId))].some((pid) => d.startedMode.get(pid) === "bus");
    const marks = s.all.filter((it) => it.firstMark !== "unknown").map((it) => it.firstMark === "right");
    if (!marks.length) continue;
    const x = out.get(sec) ?? { attempts: 0, accuracy: 0, sets: [] };
    x.attempts += marks.length;
    if (!onBus) x.sets.push(marks.filter(Boolean).length / marks.length);
    out.set(sec, x);
  }
  for (const [sec, x] of out) {
    const all = reviews.sets.filter((s) => s.section === sec).flatMap((s) => s.all).filter((it) => it.firstMark !== "unknown");
    x.accuracy = all.length ? all.filter((it) => it.firstMark === "right").length / all.length : 0;
  }
  return out;
}

/** The weakest section: the lowest first-try accuracy among sections with enough attempts. Mocks outrank homework. */
export function weakestSection(sec: Map<AdaptSection, { attempts: number; accuracy: number }>, mockSections?: Partial<Record<AdaptSection, number>>): AdaptSection | null {
  if (mockSections && Object.keys(mockSections).length) {
    const e = Object.entries(mockSections).sort((a, b) => a[1]! - b[1]!)[0];
    return e[0] as AdaptSection;
  }
  const ready = [...sec.entries()].filter(([, x]) => x.attempts >= ADAPT_MIN_ATTEMPTS);
  if (!ready.length) return null;
  ready.sort((a, b) => a[1].accuracy - b[1].accuracy);
  return ready[0][0];
}

export type Difficulty = "easy" | "medium" | "hard";

/** Easy lists under 70%, back to medium above 75%, hard after 80%+ on two separate sets. Medium by default. */
export function difficultyFor(stat: TopicStat | undefined): Difficulty {
  if (!stat || stat.attempts < ADAPT_MIN_ATTEMPTS) return "medium";
  if (stat.accuracy < 0.7) return "easy";
  if (stat.sets.filter((s) => s.accuracy >= 0.8 && s.n >= 5).length >= 2) return "hard";
  return "medium";
}

/** The weekly extra chip's topic: most errors still in review, recent ones weighted more. */
export function extraTopic(stats: Map<string, TopicStat>, sections: Section[] = ["quant", "di"]): string | null {
  const c = [...stats.values()].filter((s) => sections.includes(s.section) && s.topic !== "mixed" && s.reviewWeight > 0);
  if (!c.length) {
    const weak = [...stats.values()].filter((s) => sections.includes(s.section) && s.topic !== "mixed" && s.attempts >= 5).sort((a, b) => a.accuracy - b.accuracy)[0];
    return weak?.topic ?? null;
  }
  return c.sort((a, b) => b.reviewWeight - a.reviewWeight)[0].topic;
}

/** The tag that leads in a section, if any ("timing" moves the timer on sooner; "careless" adds the video). */
export function leadingTag(stats: Map<string, TopicStat>, sections: Section[]): Tag | null {
  const tally: Partial<Record<Tag, number>> = {};
  for (const s of stats.values()) if (sections.includes(s.section)) for (const [t, n] of Object.entries(s.tags)) tally[t as Tag] = (tally[t as Tag] ?? 0) + (n ?? 0);
  const e = Object.entries(tally).sort((a, b) => b[1]! - a[1]!)[0];
  return e && e[1]! >= 3 ? (e[0] as Tag) : null;
}

// ---------------------------------------------------------------- top-ups

export interface TopupOffer {
  id: string;
  topic: string;
  section: Section;
  wrong: number;
  total: number;
  cause: "concept" | "process" | "reading";
  line: string;
}

export const TOPUPS_PER_WEEK = 2;

/** Top-ups this week and per topic, and whether a topic is resting ("Back to this in 10 days"). */
export function topupHistory(d: Derived, weekStart: string, today: string) {
  const tops = [...d.extras.values()].filter((x) => x.kind === "topup");
  const thisWeek = tops.filter((x) => x.week === weekStart).length;
  const resting = new Map<string, string>();     // topic -> back on
  const byTopic = new Map<string, typeof tops>();
  for (const t of tops) if (t.topic) byTopic.set(t.topic, [...(byTopic.get(t.topic) ?? []), t]);
  for (const [topic, ts] of byTopic) {
    const results = ts.map((t) => d.outside.get(`x:${t.id}#0`)).filter(Boolean).map((o) => (o!.right ?? 0) / Math.max(1, (o!.right ?? 0) + (o!.wrong ?? 0) + (o!.unsure ?? 0)));
    if (results.length >= 2 && results.every((r) => r < 0.7)) {
      const last = ts[ts.length - 1];
      const back = plusDays(last.addedDay, 10);
      if (back > today) resting.set(topic, back);
    }
  }
  return { thisWeek, resting, count: (topic: string) => byTopic.get(topic)?.length ?? 0 };
}

/**
 * At the end of a review: one topic had a rough set (under 60% first try), or 4+ of its errors are
 * still in review, and the tags are mostly concept or process rather than careless slips.
 */
export function topupOffers(setItems: Item[], reviews: ReviewModel, hist: ReturnType<typeof topupHistory>): TopupOffer[] {
  if (hist.thisWeek >= TOPUPS_PER_WEEK) return [];
  const byTopic = new Map<string, Item[]>();
  for (const it of setItems) {
    if (it.firstMark === "unknown") continue;
    const topic = it.source === "rc" ? "rc" : it.topic;
    if (topic === "mixed") continue;
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), it]);
  }
  const out: TopupOffer[] = [];
  for (const [topic, its] of byTopic) {
    if (hist.resting.has(topic)) continue;
    const wrong = its.filter((it) => it.firstMark === "wrong").length;
    const rough = its.length >= 3 && wrong / its.length > 0.4;
    const live = [...reviews.items.values()].filter((it) => it.topic === topic && (it.state === "redo" || it.state === "return" || it.state === "review" || it.state === "stubborn")).length;
    const tags = its.map((it) => it.tag).filter(Boolean) as Tag[];
    // two or more concept mistakes on one topic: re-teach it, even if the set went fine overall
    if (!rough && live < 4 && tags.filter((t) => t === "concept").length < 2) continue;
    const slips = tags.filter(isSlip).length;
    if (tags.length && slips >= tags.length - slips) continue;       // mostly careless: the slips video helps more
    const concept = tags.filter((t) => t === "concept").length, process = tags.filter((t) => t === "process").length;
    const cause: TopupOffer["cause"] = its[0].group === "V" ? "reading" : concept >= process ? "concept" : "process";
    out.push({ id: `topup:${topic}:${its[0].review}`, topic, section: its[0].section, wrong, total: its.length, cause, line: "" });
  }
  return out.slice(0, TOPUPS_PER_WEEK - hist.thisWeek);
}

/** GMAT Club lists for a topic from the plan, easier first (top-ups) or at a difficulty (extra practice). */
export function listsFor(content: Content, topic: string, order: Difficulty | "easy-first"): { label: string; url: string }[] {
  const t = listTopic(topic);
  const lists: { label: string; url: string; d: string }[] = [];
  for (const task of content.plan.tasks) {
    if (task.kind !== "gmatclub_set") continue;
    const tt = task.topic ?? "";
    const match = t === "rc" ? task.section === "rc" : t === "cr" ? task.section === "cr" : tt === t;
    if (!match) continue;
    for (const [k, url] of Object.entries(task.pointer.lists ?? {})) {
      if (lists.some((l) => l.url === url)) continue;
      lists.push({ label: k === "easy" ? "Easier list" : k === "medium" ? "Medium list" : k === "older_og" ? "Older OG questions" : k === "lsat" ? "LSAT questions" : "Mixed difficulty", url, d: k });
    }
  }
  const rank = (k: string) => {
    const want = order === "easy-first" || order === "easy" ? ["easy", "mixed", "medium", "older_og", "lsat"]
      : order === "hard" ? ["medium", "mixed", "easy", "older_og", "lsat"] : ["mixed", "medium", "easy", "older_og", "lsat"];
    const i = want.indexOf(k);
    return i === -1 ? 9 : i;
  };
  // the plan has no multi-source list of its own
  if (!lists.length && t === "multi-source reasoning") lists.push({ label: "Multi-source list", url: MSR_LIST, d: "mixed" });
  return lists.sort((a, b) => rank(a.d) - rank(b.d)).map(({ label, url }) => ({ label, url }));
}

/** The plan's video on a topic, for a top-up's refresher. */
export function topicVideo(content: Content, topic: string): { youtubeId: string; url: string; title: string } | null {
  const t = listTopic(topic).toLowerCase();
  const words = t === "two-part analysis" ? ["two-part"] : t === "graphs & tables" ? ["graphical", "table"] : t === "combinations & permutations" ? ["combinations"]
    : t === "number properties" || t === "multiples and factors" || t === "remainders" ? ["number properties"]
    : t === "overlapping sets" ? ["overlapping"] : t === "word problems" ? ["word problems"] : t === "rates" ? ["rate"] : t === "rc" ? ["rc"] : t === "cr" ? ["approach cr"]
    : [t.replace(/s$/, "")];
  const v = content.plan.tasks.find((x) => x.kind === "video" && x.pointer.youtube_id && words.some((w) => (x.title ?? "").toLowerCase().includes(w)));
  return v ? { youtubeId: v.pointer.youtube_id!, url: v.pointer.url ?? `https://www.youtube.com/watch?v=${v.pointer.youtube_id}`, title: v.title ?? "" } : null;
}
