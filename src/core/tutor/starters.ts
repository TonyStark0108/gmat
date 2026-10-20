// How a session started from somewhere in the app opens: the review's answers step, a mixed review,
// a mock's result, the Sunday note. The student can edit it before sending.

import { longDate } from "../calendar";
import type { Model } from "../model";
import { weekNumber } from "../sunday";
import { topicName } from "../topics";
import { answerIfSeen } from "./tools";
import type { TutorMode } from "./prompt";

/** `context` goes to the tutor with your first message but isn't shown in the conversation. */
export interface Starter { mode: TutorMode; text: string; title: string; wantsPhoto: boolean; context?: string }

export const CONTEXT_MARK = "[context for the tutor]";

const show = (a: unknown) => (a === null || a === undefined ? "blank" : Array.isArray(a) ? `column 1 row ${a[0]}, column 2 row ${a[1]}` : String(a));

export function starterFor(m: Model, ctx: string | null): Starter | null {
  if (!ctx) return null;
  const [kind, ...rest] = ctx.split(":");
  const arg = rest.join(":");
  if (kind === "item") {
    const it = m.reviews.items.get(arg);
    if (!it) return null;
    const retry = (m.d.attempts.get(it.id) ?? []).filter((a) => a.attempt !== "last").pop();
    const ans = answerIfSeen(it);
    const lines = [
      `Can you go through this one with me? ${it.label} (${topicName(it.topic)}).`,
      `I answered ${show(it.first)}${it.firstUnsure ? " and wasn't sure" : ""}${retry ? `; on the retry I put ${show(retry.value)}` : ""}.`,
      ans.shown ? `The official answer is ${ans.text}.` : "I haven't seen the answer yet, so hints please.",
      it.tag ? `I tagged it "${it.tag}"${it.line ? ` and wrote: "${it.line}"` : ""}.` : "",
    ].filter(Boolean);
    return { mode: "explain", text: lines.join(" "), title: it.label, wantsPhoto: it.source !== "rc", context: `error-log item id ${it.id}` };
  }
  if (kind === "review") {
    const s = m.reviews.setById.get(arg);
    if (!s) return null;
    const wrong = s.items.filter((it) => it.firstMark === "wrong");
    const list = wrong.slice(0, 8).map((it) => `${it.label} (answered ${show(it.first)}, answer ${answerIfSeen(it).text}${it.tag ? `, tagged ${it.tag}` : ""})`).join("; ");
    return { mode: "review", text: `Can we go through the ones I got wrong in ${s.task.title}? ${list}.`, title: `Review: ${s.task.title}`, wantsPhoto: true,
      context: `error-log item ids ${wrong.slice(0, 8).map((it) => it.id).join(", ")}` };
  }
  if (kind === "mock") {
    const r = m.mocks.find((x) => x.pieceId === arg);
    if (!r) return null;
    const misses = m.d.mockMisses.get(arg) ?? [];
    return {
      mode: "mock", title: `Mock, ${longDate(r.day)}`, wantsPhoto: false,
      text: `I just took ${r.official ? `Official Practice Exam ${r.exam}` : "a timed section set"} (plan week ${r.planWeek}): total ${r.total ?? "?"}, Quant ${r.quant ?? "?"}, Verbal ${r.verbal ?? "?"}, DI ${r.di ?? "?"}.${misses.length ? ` Misses I tagged: ${misses.map((x) => `${x.section} ${x.topic} (${x.tag})`).join("; ")}.` : ""} What does this tell us, and what should change?`,
    };
  }
  if (kind === "checkin") {
    return { mode: "checkin", title: `Week ${weekNumber(arg, m.d.settings.startDate)} check-in`, wantsPhoto: false, text: "Can we do this week's check-in?" };
  }
  if (kind === "topic") {
    return { mode: "teach", title: `Topic: ${topicName(arg)}`, wantsPhoto: false, text: `Can you teach me ${topicName(arg).toLowerCase()}? Start from the mistakes I've been making on it.` };
  }
  return null;
}
