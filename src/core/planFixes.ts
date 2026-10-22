// Corrections to the imported plan, applied each time it's read, so the study file needn't be
// imported again. Each comes from the plan audit of 21 Oct 2026 (docs/decisions.md), and each one
// checks the task it touches is the one it expects (by id and kind), so a re-imported plan that
// already has the fix, or a different plan, is left alone.

import type { Content, Task } from "./content";

type Groups = [number, number][];

/** 1. A reading half-set ends at a passage, never in the middle of one (Verbal Review 124–143 was cut at 133/134). */
function snapReadingHalves(t: Task, content: Content): Task {
  if (t.kind !== "og_set" || t.pointer.qtype !== "RC" || !t.pointer.numbers || t.break_points?.length !== 2) return t;
  const meta = content.book_keys.books[t.pointer.book ?? "og"]?.meta as { rc_passage_groups?: Groups } | undefined;
  const [a, b] = t.pointer.numbers;
  const groups = ((t.pointer.passage_groups as Groups | undefined) ?? meta?.rc_passage_groups ?? []).filter(([x, y]) => x >= a && y <= b);
  const cut = t.break_points[0].numbers?.[1];
  if (!groups.length || cut === undefined || groups.some(([, y]) => y === cut)) return t;
  // the passage end nearest the old cut, leaving something in each half
  const ends = groups.map(([, y]) => y).filter((y) => y < b);
  if (!ends.length) return t;
  const end = ends.sort((x, y) => Math.abs(x - cut) - Math.abs(y - cut))[0];
  return { ...t, pointer: { ...t.pointer, passage_groups: groups }, break_points: [{ numbers: [a, end] }, { numbers: [end + 1, b] }] };
}

/**
 * 2. Book sets wait for the earlier set from the same book, not from another one: the importer had
 * chained every block of a question type across books (an OG CR set waiting for a Verbal Review set).
 */
function sameBookChains(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks.map((t) => {
    if (t.kind !== "og_set") return t;
    const keep = t.depends_on.filter((dep) => {
      const d = byId.get(dep);
      return !(d && d.kind === "og_set" && (d.pointer.book ?? "og") !== (t.pointer.book ?? "og"));
    });
    return keep.length === t.depends_on.length ? t : { ...t, depends_on: keep };
  });
}

/** 3. "Watch this first": the plan's lead videos for week 2, week 11, and week 4's CR block. */
const LEADS: { lead: string; kind: Task["kind"]; week: number; sections?: Task["section"][] }[] = [
  { lead: "w02-general-03", kind: "video", week: 2 },             // "watch the video BEFORE getting started"
  { lead: "w11-mock-01", kind: "test_prep", week: 11 },           // "start with this video before you do anything else"
  { lead: "w04-rc-01", kind: "video", week: 4, sections: ["cr"] }, // the CR block's lead video, merged into the RC one
];
function leadVideos(tasks: Task[]): Task[] {
  let out = tasks;
  for (const L of LEADS) {
    const lead = out.find((t) => t.id === L.lead);
    if (!lead || lead.kind !== L.kind || lead.plan_week !== L.week) continue;
    // first in its week's order too, so the week is built around it
    const rest = out.filter((t) => t.id !== L.lead);
    const at = rest.findIndex((t) => t.plan_week === L.week && (!L.sections || L.sections.includes(t.section)));
    out = at === -1 ? out : [...rest.slice(0, at), lead, ...rest.slice(at)];
    out = out.map((t) => {
      if (t.id === L.lead || t.plan_week !== L.week || t.depends_on.includes(L.lead) || (L.sections && !L.sections.includes(t.section))) return t;
      if (t.kind === "article" || t.kind === "test_prep" || t.kind === "admin") return t;     // reading about it never waits
      return { ...t, depends_on: [...t.depends_on, L.lead] };
    });
  }
  return out;
}

/**
 * GMAT Club's multi-source reasoning tag search, every difficulty (tags 1592–1594 and 1630–1632, the
 * same pattern as the plan's graphs & tables and two-part lists). The plan has no multi-source list;
 * this one was given by you on 22 Oct 2026. A link, never copied or checked by the app.
 */
export const MSR_LIST = "https://gmatclub.com/forum/search.php?selected_search_tags%5B%5D=1630&selected_search_tags%5B%5D=1631&selected_search_tags%5B%5D=1594&selected_search_tags%5B%5D=1632&selected_search_tags%5B%5D=1593&selected_search_tags%5B%5D=1592&t=0&search_tags=exact&submit=Search";

/**
 * 4. The GMAT with CJ list has 25 multi-source, 39 table and 37 graph questions; the plan's DI sets
 * ask it for 172. Shared out in plan order: once a type is used up, graphs and tables come from the
 * plan's own GMAT Club graphs & tables lists, and multi-source from GMAT Club's multi-source list.
 */
export const CJ_SUPPLY: Record<string, number> = { MSR: 25, TA: 39, GI: 37 };
function shareCj(tasks: Task[]): Task[] {
  const left = { ...CJ_SUPPLY };
  const gtLists = (week: number) => {
    const t = [...tasks].filter((x) => x.kind === "gmatclub_set" && x.topic === "graphs & tables" && x.plan_week <= week).sort((x, y) => y.plan_week - x.plan_week)[0];
    const lists = t?.pointer.lists ?? {};
    return lists.medium ?? lists.mixed ?? lists.easy ?? null;
  };
  return tasks.map((t) => {
    if (t.kind !== "di_set" || !t.pointer.recipe?.some((r) => /GMAT with CJ/.test(r.source))) return t;
    const recipe: NonNullable<Task["pointer"]["recipe"]> = [];
    for (const r of t.pointer.recipe) {
      if (!/GMAT with CJ/.test(r.source)) { recipe.push(r); continue; }
      const types = r.types ?? [];
      // split the count across its types, the first types taking the remainder
      const share = types.map((_, i) => Math.floor(r.count / types.length) + (i < r.count % types.length ? 1 : 0));
      const fromCj: Record<string, number> = {}, gt: string[] = [];
      let over = { gt: 0, msr: 0 };
      types.forEach((ty, i) => {
        const take = Math.min(share[i], left[ty] ?? 0);
        left[ty] = (left[ty] ?? 0) - take;
        if (take) fromCj[ty] = take;
        const rest = share[i] - take;
        if (!rest) return;
        if (ty === "MSR") over = { ...over, msr: over.msr + rest };
        else { over = { ...over, gt: over.gt + rest }; gt.push(ty); }
      });
      const cjCount = Object.values(fromCj).reduce((s, n) => s + n, 0);
      if (cjCount) recipe.push({ ...r, count: cjCount, types: Object.keys(fromCj) });
      const url = gtLists(t.plan_week);
      if (over.gt && url) recipe.push({ source: "GMAT Club graphs & tables list (the plan's own)", url, count: over.gt, types: gt });
      if (over.msr) recipe.push({ source: "GMAT Club multi-source list", url: MSR_LIST, count: over.msr, types: ["MSR"] });
    }
    return { ...t, pointer: { ...t.pointer, recipe } };
  });
}

/**
 * 5. A textbook to learn from (from GMAT Club's 12-week plan, 22 Oct 2026): each chapter of Manhattan
 * Prep's All the Quant + DI (you own it) comes in the plan week its topic first does, before that
 * week's practice. Reading on screen, so it fits a ride; its problem set is optional, at a desk.
 * Not a gate: practice never waits for a chapter. A chapter waits only for what every task in its
 * week and section waits for (the plan's "watch this first" video).
 */
export const BOOK = "All the Quant + DI (Manhattan Prep)";
type Anchor = { topic?: string; ds?: true; di?: "TA" | "GI" | "MSR" | "TPA"; week?: number };
const CHAPTERS: { ch: number; title: string; section: "quant" | "di"; at: Anchor; minWeek?: number; minutes: number }[] = [
  { ch: 1, title: "How Quant and DI Work", section: "quant", at: { week: 1 }, minutes: 25 },
  { ch: 2, title: "Math Fundamentals", section: "quant", at: { topic: "arithmetic" }, minutes: 30 },
  { ch: 3, title: "Data Sufficiency 101", section: "di", at: { ds: true }, minutes: 45 },
  { ch: 4, title: "Fractions and Ratios", section: "quant", at: { topic: "arithmetic" }, minutes: 40 },
  { ch: 5, title: "Strategy: Estimation", section: "quant", at: { topic: "word problems" }, minutes: 20 },
  { ch: 6, title: "Percents", section: "quant", at: { topic: "percents" }, minutes: 35 },
  { ch: 7, title: "Strategy: Arithmetic vs. Algebra 101", section: "quant", at: { topic: "algebra" }, minutes: 30 },
  { ch: 8, title: "Table Analysis", section: "di", at: { di: "TA" }, minutes: 30 },
  { ch: 9, title: "Digits and Decimals", section: "quant", at: { topic: "number properties" }, minutes: 25 },
  { ch: 10, title: "Graphics Interpretation", section: "di", at: { di: "GI" }, minutes: 30 },
  { ch: 11, title: "Linear Equations and Combos", section: "quant", at: { topic: "algebra" }, minutes: 35 },
  { ch: 12, title: "Exponents", section: "quant", at: { topic: "exponents" }, minutes: 35 },
  { ch: 13, title: "Roots", section: "quant", at: { topic: "roots" }, minutes: 30 },
  { ch: 14, title: "Quadratic Equations", section: "quant", at: { topic: "algebra" }, minWeek: 2, minutes: 35 },
  { ch: 15, title: "Formulas", section: "quant", at: { topic: "sequences" }, minutes: 30 },
  { ch: 16, title: "Inequalities and Max/Min", section: "quant", at: { topic: "inequalities" }, minutes: 35 },
  { ch: 17, title: "Translations", section: "quant", at: { topic: "word problems" }, minutes: 35 },
  { ch: 18, title: "Multi-Source Reasoning", section: "di", at: { di: "MSR" }, minutes: 30 },
  { ch: 19, title: "Statistics", section: "quant", at: { topic: "statistics" }, minutes: 35 },
  { ch: 20, title: "Weighted Averages", section: "quant", at: { topic: "statistics" }, minutes: 30 },
  { ch: 21, title: "Two-Part Analysis", section: "di", at: { di: "TPA" }, minutes: 30 },
  { ch: 22, title: "Rates and Work", section: "quant", at: { topic: "rates" }, minutes: 40 },
  { ch: 23, title: "Overlapping Sets", section: "quant", at: { topic: "overlapping sets" }, minutes: 30 },
  { ch: 24, title: "Strategy: Arithmetic vs. Algebra 201", section: "quant", at: { topic: "word problems" }, minWeek: 5, minutes: 30 },
  { ch: 25, title: "Consecutive Integers", section: "quant", at: { topic: "sequences" }, minutes: 25 },
  { ch: 26, title: "Logic Problems", section: "quant", at: { topic: "word problems" }, minWeek: 6, minutes: 25 },
  { ch: 27, title: "Divisibility and Primes", section: "quant", at: { topic: "multiples and factors" }, minutes: 40 },
  { ch: 28, title: "Odds, Evens, Positives, and Negatives", section: "quant", at: { topic: "number properties" }, minutes: 30 },
  { ch: 29, title: "Combinatorics", section: "quant", at: { topic: "combinations & permutations" }, minutes: 40 },
  { ch: 30, title: "Probability", section: "quant", at: { topic: "probability" }, minutes: 35 },
  { ch: 31, title: "Coordinate Plane", section: "quant", at: { topic: "probability" }, minutes: 30 },
];

function firstWeekOf(tasks: Task[], at: Anchor): number | null {
  if (at.week) return at.week;
  const hit = tasks.filter((t) =>
    (at.topic && t.topic === at.topic)
    || (at.ds && t.kind === "og_set" && t.pointer.qtype === "DS")
    || (at.di && ((t.pointer.types as string[] | undefined)?.includes(at.di)
      || (at.di === "TPA" && (t.topic === "two-part analysis" || t.pointer.qtype === "TPA"))
      || ((at.di === "TA" || at.di === "GI") && t.topic === "graphs & tables"))));
  return hit.length ? Math.min(...hit.map((t) => t.plan_week)) : null;
}

function bookChapters(tasks: Task[]): Task[] {
  if (tasks.some((t) => t.id.startsWith("mh-ch"))) return tasks;
  let out = [...tasks];
  for (const c of [...CHAPTERS].sort((a, b) => a.ch - b.ch)) {
    const w0 = firstWeekOf(tasks, c.at);
    if (w0 === null) continue;
    const week = Math.max(w0, c.minWeek ?? 1);
    const peers = tasks.filter((x) => x.plan_week === week && x.section === c.section);
    const lead = peers.length ? peers[0].depends_on.filter((dep) => peers.every((x) => x.depends_on.includes(dep))) : [];
    const t: Task = {
      id: `mh-ch${String(c.ch).padStart(2, "0")}`, plan_week: week, section: c.section, kind: "article", title: `Read: ${BOOK}, ch. ${c.ch}, ${c.title}`,
      optional: "recommended", est_minutes: c.minutes, review_minutes: 0, needs_desk: false, bus_ok: true, offline_ok: true,
      break_points: null, depends_on: lead, pointer: { type: "book_chapter", source: BOOK, chapter: c.ch, label: c.title },
      target: null, benchmark_week: week, alternatives: [], topic: c.at.topic,
    };
    // before the week's first task in its section (after any lead video), chapters in order
    const at = out.findIndex((x) => x.plan_week === week && x.section === c.section && !x.id.startsWith("mh-ch"));
    const i = at === -1 ? out.findIndex((x) => x.plan_week > week) : at;
    out = i === -1 ? [...out, t] : [...out.slice(0, i), t, ...out.slice(i)];
  }
  return out;
}

/**
 * 6. Pacing sprints (from GMAT Club's week 10): 10 questions in 20 minutes, no pausing, a guess after a
 * minute without a way in, never a blank, then the guessed ones retried untimed before any solution.
 * Two each for quant, DI and CR in plan weeks 9, 10 and 11, from the plan's own lists.
 */
function sprints(tasks: Task[]): Task[] {
  if (tasks.some((t) => t.id.startsWith("sprint-"))) return tasks;
  const pick = <T,>(xs: T[], n: number, k: number) => xs.length ? Array.from({ length: Math.min(n, xs.length) }, (_, i) => xs[(k * n + i) % xs.length]) : [];
  const poolOf = (week: number, section: string) => {
    const timed = tasks.filter((t) => t.kind === "gmatclub_set" && t.timed && t.section === section && t.pointer.lists_pool?.length && t.plan_week <= week + 1)
      .sort((a, b) => Math.abs(a.plan_week - week) - Math.abs(b.plan_week - week))[0];
    if (timed) return timed.pointer.lists_pool!.map((l) => ({ label: `${l.topic ?? "mixed"}${l.qtype && l.qtype !== "PS" ? ` (${l.qtype === "GT" ? "graphs & tables" : l.qtype})` : ""}`, url: l.url }));
    const lists = tasks.filter((t) => t.kind === "gmatclub_set" && t.section === section && t.pointer.lists && t.plan_week <= week)
      .flatMap((t) => Object.entries(t.pointer.lists!).filter(([k]) => k !== "easy").map(([, url]) => ({ label: t.topic ?? section, url })));
    return lists.reverse();
  };
  let out = [...tasks];
  for (const week of [9, 10, 11]) {
    for (const section of ["quant", "di", "cr"] as const) {
      const pool = poolOf(week, section);
      if (!pool.length) continue;
      for (const n of [1, 2]) {
        const t: Task = {
          id: `sprint-w${String(week).padStart(2, "0")}-${section}-${n}`, plan_week: week, section, kind: "gmatclub_set",
          title: `Timed sprint · ${section === "di" ? "DI" : section === "cr" ? "CR" : "quant"} · 10 questions in 20 minutes`,
          optional: "recommended", est_minutes: 30, review_minutes: 0, needs_desk: section !== "cr", bus_ok: section === "cr", offline_ok: false,
          break_points: null, depends_on: [], pointer: { type: "sprint", count: 10, minutes: 20, links: pick(pool, 3, (week - 9) * 2 + n - 1) },
          target: null, benchmark_week: week, alternatives: [], timed: true,
        };
        const last = out.map((x) => x.plan_week === week && x.section === section).lastIndexOf(true);
        out = last === -1 ? [...out, t] : [...out.slice(0, last + 1), t, ...out.slice(last + 1)];
      }
    }
  }
  return out;
}

const cache = new WeakMap<Content, Task[]>();

export function fixedPlan(content: Content): Task[] {
  const hit = cache.get(content);
  if (hit) return hit;
  let tasks = content.plan.tasks.map((t) => snapReadingHalves(t, content));
  tasks = sameBookChains(tasks);
  tasks = leadVideos(tasks);
  tasks = shareCj(tasks);
  tasks = bookChapters(tasks);
  tasks = sprints(tasks);
  cache.set(content, tasks);
  return tasks;
}
