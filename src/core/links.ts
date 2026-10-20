// Links: every link has a backup one tap away; a dead link is never shown again and is mentioned once
// on Sunday (spec: Links). The app never builds or guesses a web address: fallbacks come from the
// plan, the link catalogue and the CR spreadsheet only.

import type { Content, CrSet, Task } from "./content";
import type { Derived } from "./state";

export type LinkKind = "gmatclub_list" | "video" | "cr_question" | "article" | "mba";

export function linkKind(url: string): LinkKind {
  if (/mba\.com/i.test(url)) return "mba";
  if (/youtu\.?be/i.test(url)) return "video";
  if (/gmatclub\.com\/forum\/search|gmatclub\.com\/tests|gmatclub\.com\/forum\/.*-list/i.test(url)) return "gmatclub_list";
  if (/gmatclub\.com\/forum\/.+-\d+\.html/i.test(url)) return "cr_question";
  return "article";
}

export const live = (d: Derived, url: string) => !d.deadLinks.has(url);

/** Another list on the same topic, from the plan's own lists. */
export function otherList(content: Content, task: Task | null, url: string, d: Derived): string | null {
  const topic = task?.topic;
  const cands: string[] = [];
  for (const t of content.plan.tasks) {
    if (t.kind !== "gmatclub_set") continue;
    if (topic ? t.topic !== topic : t.id !== task?.id) continue;
    for (const u of Object.values(t.pointer.lists ?? {})) cands.push(u);
    for (const l of t.pointer.lists_pool ?? []) cands.push(l.url);
  }
  return cands.find((u) => u !== url && live(d, u)) ?? null;
}

/** For a video that won't play: another video from the same plan week and section. */
export function otherVideo(content: Content, task: Task, d: Derived): Task | null {
  return content.plan.tasks.find((t) => t.kind === "video" && t.id !== task.id && t.plan_week === task.plan_week && t.section === task.section
    && t.pointer.youtube_id && live(d, t.pointer.url ?? "") && (d.videoChecks.get(t.pointer.youtube_id)?.status ?? 200) === 200) ?? null;
}

/** A CR question that won't load is swapped for the next unused one from the reserve GMAT Club sets. */
export function crReplacement(content: Content, d: Derived): string | null {
  const used = new Set([...d.crSwaps.map((s) => s.url), ...d.deadLinks.keys()]);
  const reserve: CrSet[] = content.cr_bank.reserve_sets;
  for (const set of reserve) for (const q of set.questions) if (!used.has(q.url)) return q.url;
  return null;
}

/** Dead links found since a moment (for the Sunday note's "One broken link was swapped out."). */
export function deadSince(d: Derived, sinceMs: number): number {
  return [...d.deadLinks.values()].filter((x) => x.ts >= sinceMs).length;
}

/** Plan videos due a weekly check through YouTube's oEmbed service (it works from the browser). */
export function videosToCheck(content: Content, d: Derived, nowMs: number): { id: string; youtubeId: string }[] {
  const WEEK = 7 * 86_400_000;
  return content.plan.tasks.filter((t) => t.kind === "video" || t.kind === "test_prep")
    .filter((t) => t.pointer.youtube_id && nowMs - (d.videoChecks.get(t.pointer.youtube_id)?.ts ?? 0) > WEEK)
    .map((t) => ({ id: t.id, youtubeId: t.pointer.youtube_id! }));
}

/** oEmbed answers 200 for a video that plays, 401 or 403 when embedding is off (it opens on YouTube), 400 or 404 when it's gone. */
export const videoGone = (status: number) => status === 400 || status === 404;
export const videoNoEmbed = (status: number) => status === 401 || status === 403;
