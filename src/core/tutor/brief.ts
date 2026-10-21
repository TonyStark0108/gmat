// What the tutor knows about you, written fresh from the app's data at the start of every turn:
// your dates and time, where you are in the plan, your accuracy by section and topic, your errors in
// your own words, your mocks, this week, and the notes the tutor has kept about you.
// Answers to questions you haven't retried yet are never in here.

import { DAY_NAMES, longDate, parseYmd } from "../calendar";
import type { Model } from "../model";
import { LEVELS } from "../progress";
import { weekNumber } from "../sunday";
import { topicName } from "../topics";
import { weekStatus } from "../model";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const SEC: Record<string, string> = { quant: "Quant", di: "Data Insights", rc: "Reading", cr: "Critical reasoning" };

export function studentBrief(m: Model): string {
  const { d, today } = m;
  const s = d.settings;
  const L: string[] = [];
  const level = LEVELS.find((x) => x.n === m.level);
  L.push("## Dates and time");
  L.push(`- Today: ${DAY_NAMES[parseYmd(today).getDay()]} ${longDate(today)}. Target: ${s.target}.`);
  L.push(`- Plan start ${longDate(s.startDate)}; finish date ${s.finishDate ? longDate(s.finishDate) : s.agreedFinish ? `${longDate(s.agreedFinish)} (worked out from the time)` : "not set"}; book-by ${longDate(s.bookBy)}; hard stop ${longDate(s.hardStop)}.`);
  L.push(`- Test: ${s.testDate ? `booked for ${longDate(s.testDate)}` : "not booked"}.`);
  L.push(`- Desk time: Saturday ${s.saturday.enabled ? `${s.saturday.start}–${s.saturday.end}` : "off"}; mornings ${s.mornings.days.map((x) => DAY_NAMES[x].slice(0, 3)).join("/") || "none"} ${s.mornings.start}–${s.mornings.end}. Bus rides about ${m.ride} minutes on weekdays (reading, videos, CR and cards only; no quant on the bus).`);
  if (s.pauses.length) L.push(`- Pauses: ${s.pauses.map((p) => `${longDate(p.from)} – ${longDate(p.to)}`).join("; ")}.`);

  L.push("", "## Where the plan is");
  const st = m.week ? weekStatus(m) : null;
  const left = (m.week?.chips ?? []).filter((c) => !d.done.has(c.pieceId)).map((c) => m.byId.get(c.pieceId)?.task.title).filter(Boolean);
  L.push(`- ${m.pct}% of the plan done, ${Math.floor(d.totalMinutes / 60)} hours logged, ${d.counted.size} weeks that counted, ${level ? `Level ${level.n} (${level.name})` : "no level yet"}.`);
  if (m.week) L.push(`- This is study week ${weekNumber(m.weekStart, s.startDate)}. Left this week: ${left.length ? left.slice(0, 12).join("; ") : "nothing"}${st && st.reviews.some((r) => r.status !== "done") ? `; ${st.reviews.filter((r) => r.status !== "done").length} set reviews` : ""}.`);
  L.push(`- Cards due now: ${m.cardsDue}. Errors: ${m.reviews.retired} retired, ${m.reviews.inReview} in review, ${m.reviews.stubborn} stubborn ones (missed three times, still coming back).`);
  if (m.phase !== "plan") L.push(`- End game: ${m.phase}.`);

  L.push("", "## First-try accuracy by section (desk sets)");
  const secs = [...m.adapt.sections.entries()];
  if (!secs.length) L.push("- No sets logged yet.");
  for (const [k, x] of secs) L.push(`- ${SEC[k] ?? k}: ${pct(x.accuracy)} over ${x.attempts} questions${x.sets.length ? `; recent sets ${x.sets.slice(-4).map(pct).join(", ")}` : ""}.`);
  if (m.adapt.weakest) L.push(`- The app currently leans extra time toward: ${SEC[m.adapt.weakest]}.`);

  const topics = [...m.adapt.stats.values()].filter((t) => t.attempts >= 5 && t.topic !== "mixed").sort((a, b) => a.accuracy - b.accuracy).slice(0, 10);
  if (topics.length) {
    L.push("", "## Topics, weakest first (recent attempts count more)");
    for (const t of topics) {
      const tags = Object.entries(t.tags).sort((a, b) => b[1]! - a[1]!).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(", ");
      L.push(`- ${topicName(t.topic)} (${SEC[t.section] ?? t.section}): ${pct(t.accuracy)} over ${t.attempts}${t.inReview ? `, ${t.inReview} in review` : ""}${tags ? `; reasons: ${tags}` : ""}.`);
    }
  }

  const groups = m.adapt.workOn();
  if (groups.length) {
    L.push("", "## What to work on (the app's error groups, in the student's words)");
    for (const g of groups) L.push(`- ${g.heading} · ${g.detail}${g.resting ? " (resting for now)" : ""}`);
  }

  const recent = [...m.reviews.items.values()].filter((it) => it.entered && it.firstMark === "wrong" && it.source !== "share")
    .sort((a, b) => (a.setDay < b.setDay ? 1 : -1)).slice(0, 12);
  if (recent.length) {
    L.push("", "## Recent misses (newest first; ids for the tools)");
    for (const it of recent) {
      L.push(`- [${it.id}] ${it.label} · ${topicName(it.topic)} · ${it.state}${it.tag ? ` · reason: ${it.tag}` : ""}${it.line ? ` · their note: "${it.line}"` : ""}`);
    }
  }

  if (m.mocks.length) {
    L.push("", "## Mocks");
    for (const x of m.mocks) L.push(`- Plan week ${x.planWeek}, ${longDate(x.day)}: ${x.official ? `Official Practice Exam ${x.exam ?? ""}` : "timed sections"}${x.total !== null ? ` · total ${x.total}` : ""}${x.quant !== null ? ` · Q${x.quant} V${x.verbal} DI${x.di}` : ""}${x.fresh ? "" : " (a retake)"}.`);
  }

  L.push("", "## Your notes about the student (from earlier sessions)");
  if (!d.tutorNotes.length) L.push("- None yet. If this is a first session, get to know them.");
  for (const n of d.tutorNotes.slice(-25)) L.push(`- ${longDate(n.day)}: ${n.text}`);
  return L.join("\n");
}
