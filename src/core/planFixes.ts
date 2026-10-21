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
 * 4. The GMAT with CJ list has 25 multi-source, 39 table and 37 graph questions; the plan's DI sets
 * ask it for 172. Shared out in plan order: once a type is used up, graphs and tables come from the
 * plan's own GMAT Club graphs & tables lists, and multi-source from the DI Review online bank if you
 * have it (logged under What to work on → Log a question).
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
      if (over.msr) recipe.push({ source: "Multi-source sets from the DI Review online bank, if you have it (log them under What to work on)", count: over.msr, types: ["MSR"] });
    }
    return { ...t, pointer: { ...t.pointer, recipe } };
  });
}

const cache = new WeakMap<Content, Task[]>();

export function fixedPlan(content: Content): Task[] {
  const hit = cache.get(content);
  if (hit) return hit;
  let tasks = content.plan.tasks.map((t) => snapReadingHalves(t, content));
  tasks = sameBookChains(tasks);
  tasks = leadVideos(tasks);
  tasks = shareCj(tasks);
  cache.set(content, tasks);
  return tasks;
}
