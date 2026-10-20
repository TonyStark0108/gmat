// Work outside the plan: top-ups, the week's extra practice, help chips, the careless-errors video,
// drill repeats and reading-passage redos. They show as chips like any other, but they never change
// % done (spec: Top-ups never change % done; extras never enlarge the total).

import { daysBetween, plusDays, weekStartOf } from "./calendar";
import type { Content, Section, Task } from "./content";
import type { ExtraSpec } from "./events";
import { groupOf, type Piece } from "./pieces";
import type { ReviewModel } from "./review";
import type { Derived } from "./state";
import { topicFromTitle } from "./topics";

export interface ExtraPiece extends Piece {
  extra: true;
  xkind: ExtraSpec["kind"] | "drill" | "passage" | "reserve";
  week: string;
  availableFrom: string;
  hidden: boolean;
  spec?: ExtraSpec;
  reason?: string;
}

export const DRILL_GOES = 4;

function synthTask(id: string, section: Section, kind: Task["kind"], title: string, minutes: number, pointer: Task["pointer"], base?: Task): Task {
  return {
    id, plan_week: base?.plan_week ?? 0, section, kind, title, optional: "core", est_minutes: minutes, review_minutes: 0,
    needs_desk: groupOf(section) === "Q" && kind !== "video", bus_ok: groupOf(section) !== "Q" || kind === "video", offline_ok: kind === "rc_section" || kind === "cards",
    break_points: null, depends_on: [], pointer, target: base?.target ?? null, benchmark_week: base?.benchmark_week ?? 0, alternatives: [], topic: base?.topic,
  };
}

function piece(t: Task, x: Omit<ExtraPiece, keyof Piece | "extra"> & { order?: number }): ExtraPiece {
  const deskOnly = t.needs_desk;
  return {
    id: `${t.id}#0`, taskId: t.id, task: t, index: 0, of: 1, order: x.order ?? 1e6, planWeek: t.plan_week, section: t.section,
    group: groupOf(t.section), minutes: t.est_minutes, review: 0, count: (t.pointer.count as number | undefined) ?? undefined,
    deskOnly, busOk: !deskOnly, offlineOk: t.offline_ok, last: true, extra: true,
    xkind: x.xkind, week: x.week, availableFrom: x.availableFrom, hidden: x.hidden, spec: x.spec, reason: x.reason,
  };
}

export function specToPiece(s: ExtraSpec, addedDay: string): ExtraPiece {
  const id = `x:${s.id}`;
  let t: Task;
  const o = s.open;
  if (o.type === "list") t = synthTask(id, s.section, "gmatclub_set", s.title, s.minutes, { type: "gmatclub_list", links: o.urls, count: o.count, refresher: s.refresher });
  else if (o.type === "video") t = synthTask(id, s.section, "video", s.title, s.minutes, { type: "video", youtube_id: o.youtubeId, url: o.url });
  else if (o.type === "link") t = synthTask(id, s.section, "article", s.title, s.minutes, { type: "url", url: o.url });
  else if (o.type === "cards") t = synthTask(id, s.section, "cards", s.title, s.minutes, { type: "cards", topic: o.topic });
  else t = synthTask(id, s.section, "rc_section", s.title, s.minutes, { type: "lsat_rc", section: o.section, count: 0 });
  if (s.kind === "keepsharp" && o.type === "list") t.timed = true;
  return piece(t, { xkind: s.kind, week: s.week, availableFrom: addedDay, hidden: !!s.hidden, spec: s, reason: s.reason });
}

/** Drill goes, across the plan's drill and its repeats. */
export function drillGoes(d: Derived, taskId: string) {
  const out = [];
  for (const [pid, evs] of d.drills) if (pid === `${taskId}#0` || pid.startsWith(`x:drill:${taskId}:`)) out.push(...evs);
  return out.sort((a, b) => a.go - b.go);
}

export function buildExtras(content: Content, plan: Piece[], d: Derived, reviews: ReviewModel, today: string): ExtraPiece[] {
  const out: ExtraPiece[] = [];
  for (const s of d.extras.values()) out.push(specToPiece(s, s.addedDay));

  // Drills: until the target's reached, it comes back at the next desk session; four goes at most.
  for (const p of plan) {
    if (p.task.kind !== "drill" || !p.task.target) continue;
    const goes = drillGoes(d, p.taskId);
    const last = goes[goes.length - 1];
    if (!last || last.met || goes.some((g) => g.met) || goes.length >= DRILL_GOES) continue;
    const go = goes.length + 1;
    const t = synthTask(`x:drill:${p.taskId}:${go}`, p.section, "drill", `${p.task.title}, go ${go}`, 15, p.task.pointer, p.task);
    out.push(piece(t, { xkind: "drill", week: weekStartOf(today), availableFrom: plusDays(last.day, 1), hidden: false }));
  }

  // Reading: three or more misses on one passage bring the whole passage back 3–7 days later.
  for (const s of reviews.sets) {
    if (s.task.kind !== "rc_section" || s.status !== "done") continue;
    const doneDay = d.reviewDone.get(s.id)!.day;
    const sec = content.rc_bank.sections.find((x) => x.id === s.task.pointer.section);
    sec?.passages.forEach((pa, pi) => {
      const misses = s.all.filter((it) => it.passageId === pa.id && it.firstMark === "wrong").length;
      if (misses < 3) return;
      const t = synthTask(`x:passage:${s.taskId}:${pi}`, "rc", "rc_section", `A reading passage again (${sec.source}, passage ${pi + 1})`, 15,
        { type: "lsat_rc", section: sec.id, passages: [pi], count: pa.questions.length }, s.task);
      t.offline_ok = true;
      out.push(piece(t, { xkind: "passage", week: weekStartOf(plusDays(doneDay, 3)), availableFrom: plusDays(doneDay, 3), hidden: false }));
    });
  }
  return out;
}

/** The piece for a reserve CR set already done (so its review and history stay). */
export function reserveCrPiece(content: Content, pieceId: string): ExtraPiece | null {
  const id = pieceId.replace(/^x:reserve:/, "").replace(/#0$/, "");
  const set = content.cr_bank.reserve_sets.find((s) => s.id === id);
  if (!set) return null;
  const t = synthTask(`x:reserve:${set.id}`, "cr", "cr_set", `A reserve CR set (${set.label})`, Math.round(set.size * 2), { type: "lsat_cr", set: set.id, label: set.label, count: set.size });
  t.needs_desk = false;
  t.bus_ok = true;
  return piece(t, { xkind: "reserve", week: "", availableFrom: "", hidden: true });
}

/**
 * When bus work runs ahead of the desk, rides get the reserve GMAT Club CR sets, never next week's plan
 * tasks (spec: If one budget runs ahead of the other). One at a time, in order.
 */
export function reserveCr(content: Content, d: Derived, today: string): ExtraPiece[] {
  const next = content.cr_bank.reserve_sets.find((s) => !d.done.has(`x:reserve:${s.id}#0`));
  if (!next) return [];
  const t = synthTask(`x:reserve:${next.id}`, "cr", "cr_set", `A reserve CR set (${next.label})`, Math.round(next.size * 2), { type: "lsat_cr", set: next.id, label: next.label, count: next.size });
  t.needs_desk = false;
  t.bus_ok = true;
  return [piece(t, { xkind: "reserve", week: weekStartOf(today), availableFrom: today, hidden: true })];
}

/** The topic a drill counts toward (its top-up goes there after four goes). */
export function drillTopic(t: Task): string {
  return t.topic ?? topicFromTitle(t.title) ?? "algebra";
}

/** Extras that belong to a week and are free to come up. */
export function extrasFor(extras: ExtraPiece[], weekStart: string, today: string, d: Derived): ExtraPiece[] {
  return extras.filter((x) => !d.done.has(x.id) && x.availableFrom <= today && x.week !== "" && (x.week <= weekStart || x.xkind === "drill" || x.xkind === "passage")
    // keep-sharp, lean and extra chips belong to their own week only
    && (!["lean", "extra", "keepsharp"].includes(x.xkind) || x.week === weekStart)
    && daysBetween(x.availableFrom, today) <= 60);
}
