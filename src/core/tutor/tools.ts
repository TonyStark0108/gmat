// The tutor's tools: what it can look up in the app, and what it can do. Looking things up is free;
// adding work to your week waits for your OK; a card or a note is added straight away (both can be
// deleted). Answers to questions you haven't retried yet stay hidden here too.

import { daysBetween, longDate } from "../calendar";
import type { BookId, Section } from "../content";
import type { EventBody, ExtraSpec } from "../events";
import { listsFor, type Difficulty } from "../adapt";
import type { Model } from "../model";
import type { Item } from "../review";
import { QUANT_TOPICS, bookTopic, topicName } from "../topics";

export interface ToolDef { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean } }

const BOOKS: BookId[] = ["og", "qr", "vr", "dir"];
const SECTIONS = ["quant", "di", "rc", "cr"];

export const TOOLS: ToolDef[] = [
  {
    name: "get_errors",
    description: "The student's error log from the app: questions they got wrong (or right but unsure), with where each is, its topic, the reason they tagged, their own note, and where it is in the redo cycle. Use it before teaching a topic or diagnosing a pattern.",
    input_schema: { type: "object", properties: {
      section: { type: "string", enum: SECTIONS, description: "Only this section" },
      topic: { type: "string", description: "Only this topic, e.g. 'rates' or 'ds · percents'" },
      state: { type: "string", enum: ["in review", "retired", "stubborn", "all"], description: "Default: in review" },
      limit: { type: "integer", description: "At most this many (default 25)" },
    }, additionalProperties: false },
  },
  {
    name: "get_topic_stats",
    description: "First-try accuracy by topic (recent attempts count more), attempts, errors still in review, and the reasons tagged. Use it to find where the student loses points.",
    input_schema: { type: "object", properties: { section: { type: "string", enum: SECTIONS } }, additionalProperties: false },
  },
  {
    name: "get_question",
    description: "One question from the error log by its id: book and number (or reading passage and question), the student's answers, timing, tag and note, and the official answer if the student has already seen it. The app does not store official question text: ask the student for a photo or the text when you need it.",
    input_schema: { type: "object", properties: { item_id: { type: "string" } }, required: ["item_id"], additionalProperties: false },
  },
  {
    name: "find_official_questions",
    description: "Find official questions (Official Guide and the review books) on a topic for practice. Returns book, number, page, difficulty, and whether the student has seen it: new, seen and right a while ago, or coming later in the plan. Never invent questions: practice is always official or from the plan's lists.",
    input_schema: { type: "object", properties: {
      topic: { type: "string", description: `A quant topic (${QUANT_TOPICS.join(", ")}), 'ds · <topic>' for data sufficiency, 'two-part analysis', 'rc' or 'cr'` },
      qtype: { type: "string", enum: ["PS", "DS", "TPA", "RC", "CR"] },
      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
      count: { type: "integer", description: "How many (default 8, at most 15)" },
    }, additionalProperties: false },
  },
  {
    name: "assign_official_questions",
    description: "Add a short set of official questions to the student's week as homework. The student sees your reason and approves it first. The app marks it from the answer key and reviews it 1–3 days later like any other set. Keep sets to 5–12 questions.",
    input_schema: { type: "object", properties: {
      title: { type: "string", description: "Short, e.g. 'Rates, a second look'" },
      book: { type: "string", enum: BOOKS },
      numbers: { type: "array", items: { type: "integer" } },
      reason: { type: "string", description: "One sentence the student will read" },
    }, required: ["title", "book", "numbers", "reason"], additionalProperties: false },
  },
  {
    name: "assign_gmatclub_list",
    description: "Add a GMAT Club practice list on a topic to the student's week (from the plan's own lists; the student counts right, wrong and not sure afterwards). The student approves it first.",
    input_schema: { type: "object", properties: {
      topic: { type: "string" },
      count: { type: "integer", description: "Questions to do from the list (default 10)" },
      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
      reason: { type: "string" },
    }, required: ["topic", "reason"], additionalProperties: false },
  },
  {
    name: "make_card",
    description: "Save a flashcard in the student's own deck: a principle or trap, never a whole question. Front: a short cue. Back: what to do. Added straight away.",
    input_schema: { type: "object", properties: { front: { type: "string" }, back: { type: "string" }, topic: { type: "string" } }, required: ["front", "back"], additionalProperties: false },
  },
  {
    name: "save_note",
    description: "Remember something durable about the student for later sessions (goals, schools, how they like to learn, what worries them, a recurring mistake, what you agreed to focus on). One short sentence. Not for trivia.",
    input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false },
  },
  {
    name: "get_week",
    description: "This week's plan in the app: every chip and whether it's done, the reviews, the extras, and next week's shape.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const NEEDS_OK = new Set(["assign_official_questions", "assign_gmatclub_list"]);

export interface ToolOutcome {
  result: string;
  isError?: boolean;
  events?: EventBody[];      // what to record (after approval, for the tools that need it)
  ask?: string;              // what the student is asked to approve
}

const sectionOfQtype = (q: string): Section => (q === "PS" ? "quant" : q === "DS" || q === "TPA" ? "di" : q === "RC" ? "rc" : "cr");

/** The official answer, but only once the student has seen it (never before their blind retry). */
export function answerIfSeen(it: Item): { shown: boolean; text: string } {
  if (it.state === "review") return { shown: false, text: "hidden: their blind retry for this set hasn't happened yet. Give hints, not the answer." };
  if (it.key === undefined || it.key === null) return { shown: false, text: "not in the app's key (ask the student for the book's answer)" };
  return { shown: true, text: Array.isArray(it.key) ? `column 1 row ${it.key[0]}, column 2 row ${it.key[1]}` : String(it.key) };
}

const describe = (it: Item) => {
  const a = answerIfSeen(it);
  return {
    id: it.id, where: it.label, section: it.section, topic: topicName(it.topic), first_answer: it.first, not_sure: it.firstUnsure,
    seconds: it.firstMs ? Math.round(it.firstMs / 1000) : null, state: it.state, misses: it.misses, reason: it.tag ?? null, note: it.line ?? null,
    official_answer: a.text, set_day: it.setDay, ...(it.url ? { link: it.url } : {}),
  };
};

function str(x: unknown): string | undefined { return typeof x === "string" && x.trim() ? x.trim() : undefined; }
function int(x: unknown, dflt: number, max: number): number { const n = typeof x === "number" ? Math.floor(x) : dflt; return Math.max(1, Math.min(max, n)); }

export function runTool(m: Model, name: string, input: Record<string, unknown>): ToolOutcome {
  try {
    switch (name) {
      case "get_errors": return getErrors(m, input);
      case "get_topic_stats": {
        const sec = str(input.section);
        const rows = [...m.adapt.stats.values()].filter((t) => !sec || t.section === sec).sort((a, b) => a.accuracy - b.accuracy)
          .map((t) => ({ topic: topicName(t.topic), section: t.section, first_try: `${Math.round(t.accuracy * 100)}%`, attempts: t.attempts, in_review: t.inReview, reasons: t.tags }));
        return { result: JSON.stringify(rows.slice(0, 30)) };
      }
      case "get_question": {
        const it = m.reviews.items.get(String(input.item_id ?? ""));
        if (!it) return { result: "No question with that id in the error log.", isError: true };
        return { result: JSON.stringify(describe(it)) };
      }
      case "find_official_questions": return findOfficial(m, input);
      case "assign_official_questions": return assignOfficial(m, input);
      case "assign_gmatclub_list": return assignList(m, input);
      case "make_card": {
        const front = str(input.front), back = str(input.back);
        if (!front || !back) return { result: "A card needs a front and a back.", isError: true };
        return { result: "Saved to the student's cards.", events: [{ type: "line", source: "tutor", text: back, front, topic: str(input.topic) }] };
      }
      case "save_note": {
        const note = str(input.note);
        if (!note) return { result: "Empty note.", isError: true };
        return { result: "Noted.", events: [{ type: "tutor.note", text: note.slice(0, 300) }] };
      }
      case "get_week": return getWeek(m);
      default: return { result: `No tool called ${name}.`, isError: true };
    }
  } catch (e) {
    return { result: `That didn't work: ${(e as Error).message}`, isError: true };
  }
}

function getErrors(m: Model, input: Record<string, unknown>): ToolOutcome {
  const sec = str(input.section), topic = str(input.topic)?.toLowerCase(), state = str(input.state) ?? "in review";
  const limit = int(input.limit, 25, 60);
  const want = (it: Item) => state === "all" ? true : state === "retired" ? it.state === "retired" : state === "stubborn" ? it.state === "stubborn"
    : ["review", "redo", "return", "stubborn"].includes(it.state);
  const rows = [...m.reviews.items.values()]
    .filter((it) => it.entered && it.firstMark !== "unknown" && want(it) && (!sec || it.section === sec) && (!topic || it.topic.toLowerCase().includes(topic) || topicName(it.topic).toLowerCase().includes(topic)))
    .sort((a, b) => (a.setDay < b.setDay ? 1 : -1)).slice(0, limit).map(describe);
  return { result: rows.length ? JSON.stringify(rows) : "Nothing in the error log matches." };
}

function planCoverage(m: Model): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of m.content.plan.tasks) {
    const p = t.pointer;
    if (t.kind === "og_set" && p.numbers) for (let n = p.numbers[0]; n <= p.numbers[1]; n++) out.set(`${p.book ?? "og"}:${n}`, t.plan_week);
    for (const r of p.recipe ?? []) if (r.numbers) for (let n = r.numbers[0]; n <= r.numbers[1]; n++) out.set(`${r.source.startsWith("DI Review") ? "dir" : "og"}:${n}`, t.plan_week);
  }
  return out;
}

function findOfficial(m: Model, input: Record<string, unknown>): ToolOutcome {
  const topic = str(input.topic)?.toLowerCase(), qtype = str(input.qtype), diff = str(input.difficulty);
  const count = int(input.count, 8, 15);
  const cover = planCoverage(m);
  const seen = new Map<string, Item>();
  for (const it of m.reviews.items.values()) if (it.book && it.n) seen.set(`${it.book}:${it.n}`, it);
  const assigned = new Set<string>();
  for (const x of m.d.extras.values()) if (x.open.type === "book") for (const n of x.open.numbers) assigned.add(`${x.open.book}:${n}`);
  const rows: { book: BookId; n: number; page: number | null; difficulty: string | null; topic: string; status: string; rank: number }[] = [];
  for (const book of BOOKS) {
    for (const q of m.content.book_keys.books[book]?.questions ?? []) {
      if (qtype && q.section !== qtype) continue;
      if (typeof q.answer !== "string" && !Array.isArray(q.answer)) continue;
      const section = sectionOfQtype(q.section);
      const t = bookTopic(q.section, q.concept, section);
      if (topic && !t.toLowerCase().includes(topic.replace(/^ds · /, "")) && !(topic === "rc" && q.section === "RC") && !(topic === "cr" && q.section === "CR")) continue;
      if (topic?.startsWith("ds · ") && q.section !== "DS") continue;
      if (diff && (q.difficulty ?? "").toLowerCase() !== diff) continue;
      const key = `${book}:${q.n}`;
      if (assigned.has(key)) continue;
      const it = seen.get(key);
      let status: string, rank: number;
      if (!it && !cover.has(key)) { status = "new: not in the plan"; rank = 0; }
      else if (it && it.firstMark === "right" && !it.firstUnsure && daysBetween(it.setDay, m.today) >= 21) { status = `seen ${longDate(it.setDay)}, right`; rank = 1; }
      else if (it?.state === "retired") { status = `retired ${it.retiredDay ? longDate(it.retiredDay) : ""}`.trim(); rank = 2; }
      else if (!it && cover.has(key)) { status = `comes later in the plan (plan week ${cover.get(key)})`; rank = 3; }
      else continue;     // seen recently, or still in the redo cycle: the app brings it back itself
      rows.push({ book, n: q.n, page: q.page ?? null, difficulty: q.difficulty ?? null, topic: topicName(t), status, rank });
    }
  }
  rows.sort((a, b) => a.rank - b.rank);
  const pick = rows.slice(0, count).map(({ rank: _r, ...x }) => x);
  return { result: pick.length ? JSON.stringify(pick) : "No official questions match. Try a GMAT Club list for this topic (assign_gmatclub_list)." };
}

function assignOfficial(m: Model, input: Record<string, unknown>): ToolOutcome {
  const book = str(input.book) as BookId | undefined, title = str(input.title), reason = str(input.reason);
  const nums = Array.isArray(input.numbers) ? [...new Set(input.numbers.filter((x): x is number => Number.isInteger(x)))] : [];
  if (!book || !BOOKS.includes(book) || !title || !reason) return { result: "Needs a book, a title, numbers and a reason.", isError: true };
  if (!nums.length || nums.length > 15) return { result: "Assign between 1 and 15 questions.", isError: true };
  const qs = m.content.book_keys.books[book]?.questions ?? [];
  const found = nums.map((n) => qs.find((q) => q.n === n));
  const missing = nums.filter((_, i) => !found[i]);
  if (missing.length) return { result: `Not in the ${book.toUpperCase()} answer key: ${missing.join(", ")}.`, isError: true };
  const qtypes = new Set(found.map((q) => q!.section));
  if (qtypes.size > 1) return { result: "Keep one question type per set (all PS, all DS, …).", isError: true };
  const qtype = [...qtypes][0];
  const spec: ExtraSpec = {
    id: `tutor:${m.weekStart}:${book}:${nums.join("-")}`, kind: "tutor", week: m.weekStart, section: sectionOfQtype(qtype), topic: null,
    title, minutes: Math.round(nums.length * (qtype === "RC" ? 2.5 : 2.2)), open: { type: "book", book, qtype, numbers: nums }, reason,
  };
  if (m.d.extras.has(spec.id)) return { result: "That exact set is already in the week." };
  return { result: "Added to this week. The app marks it and brings it back for review 1–3 days later.", events: [{ type: "extra.added", extra: spec }], ask: `${title}: ${book === "og" ? "OG" : book.toUpperCase()} ${nums.join(", ")}. ${reason}` };
}

function assignList(m: Model, input: Record<string, unknown>): ToolOutcome {
  const topic = str(input.topic)?.toLowerCase(), reason = str(input.reason);
  if (!topic || !reason) return { result: "Needs a topic and a reason.", isError: true };
  const diff = (str(input.difficulty) ?? "easy-first") as Difficulty | "easy-first";
  const urls = listsFor(m.content, topic, diff).slice(0, 2);
  if (!urls.length) return { result: `The plan has no GMAT Club list for "${topic}". Topics with lists: ${QUANT_TOPICS.join(", ")}, two-part analysis, graphs & tables, rc, cr.`, isError: true };
  const count = int(input.count, 10, 25);
  const section: Section = topic === "rc" ? "rc" : topic === "cr" ? "cr" : topic.startsWith("ds · ") || ["two-part analysis", "graphs & tables"].includes(topic) ? "di" : "quant";
  const spec: ExtraSpec = {
    id: `tutor:${m.weekStart}:list:${topic}`, kind: "tutor", week: m.weekStart, section, topic, title: `${topicName(topic)} · ${count} questions (from your tutor)`,
    minutes: Math.round(count * 2.5), open: { type: "list", urls, count }, reason,
  };
  if (m.d.extras.has(spec.id)) return { result: "A list on that topic is already in this week." };
  return { result: "Added to this week.", events: [{ type: "extra.added", extra: spec }], ask: `${spec.title}. ${reason}` };
}

function getWeek(m: Model): ToolOutcome {
  const chips = (m.week?.chips ?? []).map((c) => m.byId.get(c.pieceId)).filter(Boolean).map((p) => ({ title: p!.task.title, section: p!.section, minutes: p!.minutes, done: m.d.done.has(p!.id) }));
  const extras = m.weekExtras.map((x) => ({ title: x.task.title, kind: x.xkind, done: m.d.done.has(x.id) }));
  const reviews = m.weekReviews.map((r) => ({ set: r.task.title, status: r.status, to_look_at: r.items.length }));
  return { result: JSON.stringify({ week_of: m.weekStart, light: !!m.week?.light, plan_chips: chips, extras, reviews, cards_due: m.cardsDue }) };
}
