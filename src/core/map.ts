// The map: every task of the plan on one path, by plan week, so you can see what's done and what's
// left without a backlog in your face. Finished weeks fold into one line, the week you're in opens up,
// later weeks show only how many tasks they hold and what they're about. Counts work done, never dates.

import type { Section, Kind } from "./content";
import { LEVELS } from "./progress";
import type { Model } from "./model";
import { topicName } from "./topics";

export type NodeStatus = "done" | "half" | "next" | "open" | "later";

export interface MapNode {
  taskId: string;
  title: string;
  section: Section;
  kind: Kind;
  minutes: number;
  status: NodeStatus;
  pieceIds: string[];
  inThisWeek: boolean;        // on this calendar week's chips, so it can be started from the map
}

export interface MapUnit {
  week: number;
  about: string;               // "ratios, percents, graphs & tables"
  nodes: MapNode[];
  done: number;
  total: number;
  minutesLeft: number;
  state: "done" | "current" | "later";
  levelAfter: { n: number; name: string } | null;   // the level this week unlocks, if any
}

export interface PlanMap { units: MapUnit[]; doneTasks: number; totalTasks: number; hoursLeft: number; currentWeek: number }

const ABOUT_KINDS = new Set(["gmatclub_set", "video", "og_set", "drill"]);

/** What a plan week is about, in a few words: its topics, or failing that its sections. */
function aboutOf(nodes: MapNode[], topics: (string | undefined)[]): string {
  const t = [...new Set(topics.filter(Boolean) as string[])].map((x) => topicName(x).toLowerCase()).filter((x) => x !== "mixed");
  if (t.length) return t.slice(0, 3).join(", ") + (t.length > 3 ? "…" : "");
  const secs = [...new Set(nodes.map((n) => n.section))].filter((s) => s !== "general");
  const name: Record<string, string> = { quant: "quant", di: "DI", rc: "reading", cr: "CR", mock: "a mock" };
  return secs.map((s) => name[s] ?? s).join(", ");
}

export function buildMap(m: Model, nextPieceId: string | null): PlanMap {
  const byTask = new Map<string, typeof m.plan>();
  for (const p of m.plan) byTask.set(p.taskId, [...(byTask.get(p.taskId) ?? []), p]);
  const thisWeek = new Set((m.week?.chips ?? []).map((c) => c.pieceId));
  const nextTask = nextPieceId ? m.byId.get(nextPieceId)?.taskId ?? null : null;

  const weeks = new Map<number, { nodes: MapNode[]; topics: (string | undefined)[] }>();
  for (const [taskId, ps] of byTask) {
    const t = ps[0].task;
    const doneN = ps.filter((p) => m.d.done.has(p.id) || m.letGo.has(taskId)).length;
    const status: NodeStatus = doneN === ps.length ? "done" : taskId === nextTask ? "next" : doneN > 0 ? "half" : ps.some((p) => thisWeek.has(p.id)) ? "open" : "later";
    const node: MapNode = {
      taskId, title: t.title ?? "Task", section: t.section, kind: t.kind, minutes: ps.reduce((s, p) => s + p.minutes, 0),
      status, pieceIds: ps.map((p) => p.id), inThisWeek: ps.some((p) => thisWeek.has(p.id)),
    };
    const w = weeks.get(t.plan_week) ?? { nodes: [], topics: [] };
    w.nodes.push(node);
    if (ABOUT_KINDS.has(t.kind)) w.topics.push(t.topic);
    weeks.set(t.plan_week, w);
  }

  const order = [...weeks.keys()].sort((a, b) => a - b);
  // the week you're in: the first plan week with anything left
  const currentWeek = order.find((w) => weeks.get(w)!.nodes.some((n) => n.status !== "done")) ?? order[order.length - 1] ?? 1;
  const units: MapUnit[] = order.map((week) => {
    const { nodes, topics } = weeks.get(week)!;
    const done = nodes.filter((n) => n.status === "done").length;
    const lvl = LEVELS.find((L) => L.weeks && L.weeks[1] === week);
    return {
      week, about: aboutOf(nodes, topics), nodes, done, total: nodes.length,
      minutesLeft: nodes.filter((n) => n.status !== "done").reduce((s, n) => s + n.minutes, 0),
      // open: the week you're in, and any later week whose tasks are already on this calendar week
      state: done === nodes.length ? "done" : week === currentWeek || nodes.some((n) => n.inThisWeek && n.status !== "done") ? "current" : "later",
      levelAfter: lvl ? { n: lvl.n, name: lvl.name } : null,
    };
  });
  const all = units.flatMap((u) => u.nodes);
  const doneTasks = all.filter((n) => n.status === "done").length;
  return { units, doneTasks, totalTasks: all.length, hoursLeft: Math.round(units.reduce((s, u) => s + u.minutesLeft, 0) / 60), currentWeek };
}
