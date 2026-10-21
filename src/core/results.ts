// Reading your results: the plan's weekly guides, built in (spec: Reading your results). One plain
// line on submit, one at the review's close, a chip only when something needs doing. The benchmark
// table itself is never shown. Tone: no "behind", "should", "must", "still", "only".

import { DAY_NAMES, parseYmd, plusDays, nextDeskSlot } from "./calendar";
import type { Content, Section, Task } from "./content";
import type { ExtraSpec } from "./events";
import { inWords } from "./grid";
import type { Item, SetReview } from "./review";
import type { Settings } from "./settings";

interface Rule {
  week: number; section: string; guide_link: string | null; careless_max_share?: number | null; careless_per_section_max?: number;
  accuracy?: Record<string, { great?: [number, number]; fine?: [number, number]; target?: [number, number]; note?: string }>;
  time?: Record<string, { target_s?: number; flag_s?: number; target_min?: number }>;
  gap_below_665?: [number, number];
  forum_level?: string;
}

export function ruleFor(content: Content, week: number, section: string): Rule | null {
  const rules = content.benchmarks.rules as Rule[];
  const sec = section === "di" ? ["di", "quant"] : [section];
  for (const s of sec) {
    const same = rules.filter((r) => r.section === s && r.week <= week).sort((a, b) => b.week - a.week)[0];
    if (same) return same;
  }
  return null;
}

/** The "Why?" link: only where the plan gives the guide's address (week 1). */
export function whyLink(content: Content, week: number, section: string): string | null {
  const r = (content.benchmarks.rules as Rule[]).find((x) => x.week === week && x.section === section);
  return r?.guide_link ?? null;
}

const pct = (x: number) => Math.round(x * 100);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** One line against the week's numbers, from accuracy and time only. */
export function submitLine(content: Content, task: Task, items: Item[], minutesTotal?: number): string | null {
  const known = items.filter((it) => it.firstMark !== "unknown");
  if (!known.length) return null;
  const acc = known.filter((it) => it.firstMark === "right").length / known.length;
  const w = task.benchmark_week || task.plan_week;
  const rule = ruleFor(content, w, task.section);
  const a = pct(acc);
  let line: string;
  if (task.section === "rc" || task.section === "cr") {
    const t = rule?.accuracy?.lsat?.target ?? [70, 80];
    line = a >= t[0] ? `${a}%. In the plan's ${t[0]}–${t[1]}% range for reading sets.` : `${a}%. The plan's range for reading sets is ${t[0]}–${t[1]}%; the review is where this moves.`;
    if (task.section === "cr") line = line.replace("reading sets", "CR sets");
    if (minutesTotal && rule?.time?.lsat_set_25?.target_min) {
      const target = rule.time.lsat_set_25.target_min;
      line += minutesTotal <= target ? ` About ${minutesTotal} minutes, inside the hour.` : ` About ${minutesTotal} minutes; the plan aims for about ${target}.`;
    }
    return line;
  }
  const og = rule?.accuracy?.og;
  const great = og?.great ?? [80, 90], fine = og?.fine ?? [70, 80];
  if (a >= great[0]) line = `${a}% on new topics. Right where the plan has week ${w}.`;
  else if (a >= fine[0]) line = `${a}%. Inside the plan's range for week ${w}.`;
  else line = `${a}%. Lower is fine on new topics; the review is where this moves.`;
  // time per question, when answers went in as you went
  const timed = known.filter((it) => it.firstMs !== null && it.firstMs > 5_000 && it.firstMs < 20 * 60_000);
  if (timed.length >= known.length / 2) {
    const avg = timed.reduce((s, it) => s + it.firstMs!, 0) / timed.length / 1000;
    const tr = task.section === "di" ? rule?.time?.di ?? { target_s: 150, flag_s: 180 } : rule?.time?.quant ?? { target_s: 120, flag_s: 150 };
    if (tr.flag_s && avg > tr.flag_s) line += ` About ${mmss(avg)} a question; the plan aims for about ${mmss(tr.target_s ?? 120)}.`;
    else line += ` About ${mmss(avg)} a question.`;
  }
  return line;
}

/** "Two slips in 20. This week's bar is one." (known once the tags are in) */
export function carelessLine(content: Content, task: Task, items: Item[], slips: number): string | null {
  const rule = ruleFor(content, task.benchmark_week || task.plan_week, task.section);
  if (!rule?.careless_max_share || task.section === "rc" || task.section === "cr") return null;
  const n = items.length;
  const bar = Math.max(1, Math.round(rule.careless_max_share * n));
  return `${slips ? inWords(slips) : "No"} ${slips === 1 ? "slip" : "slips"} in ${n}. This week's aim: ${inWords(bar).toLowerCase()} or fewer.`;
}

export interface CloseSummary {
  diagnosis: string | null;
  careless: string | null;
  scheduled: string | null;
  cards: string | null;
  add: ExtraSpec | null;            // the video that goes in next week
  rc: { byType: { name: string; right: number; total: number }[]; byTopic: { name: string; right: number; total: number }[] } | null;
}

const CARELESS_VIDEO = "w01-quant-01";    // "Why careless errors cost so much"
const CR_APPROACH_VIDEO = "w01-cr-01";    // "How to approach CR"

export function closeOf(content: Content, s: SetReview, items: Item[], linesWritten: number, settings: Settings, today: string, nextWeek: string): CloseSummary {
  const first = items.filter((it) => it.firstMark === "wrong");
  const retried = first.filter((it) => it.attempts > 0);
  const fixed = retried.filter((it) => it.state === "return" || it.state === "retired");
  const out: CloseSummary = { diagnosis: null, careless: null, scheduled: null, cards: null, add: null, rc: null };
  const video = (taskId: string, kind: ExtraSpec["kind"]): ExtraSpec | null => {
    const t = content.plan.tasks.find((x) => x.id === taskId);
    if (!t?.pointer.youtube_id) return null;
    return { id: `${kind}:${s.taskId}`, kind, week: nextWeek, section: t.section, topic: null, title: t.title ?? "Video", minutes: t.est_minutes || 10,
      open: { type: "video", youtubeId: t.pointer.youtube_id, url: t.pointer.url ?? "" } };
  };
  if (s.task.kind === "rc_section") {
    const tally = (key: (it: Item) => string | undefined) => {
      const m = new Map<string, { right: number; total: number }>();
      for (const it of s.all) { const k = key(it); if (!k) continue; const x = m.get(k) ?? { right: 0, total: 0 }; x.total++; if (it.firstMark === "right") x.right++; m.set(k, x); }
      return [...m.entries()].map(([name, v]) => ({ name, ...v }));
    };
    out.rc = { byType: tally((it) => it.rcType), byTopic: tally((it) => it.rcTopic) };
    out.diagnosis = "Reading questions don't come back one by one. Here's how it went by question type and by topic.";
  } else if (first.length) {
    const slipsNotGaps = fixed.length >= first.length / 2;
    if (s.group === "Q") {
      out.diagnosis = slipsNotGaps ? "These were slips, not gaps. Careless slips are the thing to work on." : "Most came out the same way twice: these are about the topic itself.";
      if (slipsNotGaps) out.add = video(CARELESS_VIDEO, "careless");
      else {
        // "Need help?": the week's own help link for the cause you hit (content), out of the free 15%
        const h = helpFor(content, s.task.benchmark_week || s.task.plan_week, s.section, "content");
        if (h) out.add = { id: `help:${s.taskId}`, kind: "help", week: nextWeek, section: s.section, topic: null, title: h.title, minutes: 15,
          open: h.youtubeId ? { type: "video", youtubeId: h.youtubeId, url: h.url } : { type: "link", url: h.url } };
      }
    } else if (s.section === "cr") {
      out.diagnosis = slipsNotGaps ? "These were slips, not gaps. The approach isn't consistent yet." : "Most came out the same way twice: the approach video is worth another look.";
      out.add = video(CR_APPROACH_VIDEO, "approach");
    }
  }
  const slips = items.filter((it) => it.tag === "careless").length;
  out.careless = carelessLine(content, s.task, s.all, slips);
  // what got scheduled
  const returns = items.filter((it) => it.state === "return").length;
  const redos = items.filter((it) => it.state === "redo");
  const moved = items.filter((it) => it.state === "stubborn").length;
  const bits: string[] = [];
  if (returns) bits.push(`${inWords(returns)} ${returns === 1 ? "comes" : "come"} back in 2–3 weeks`);
  if (redos.length) {
    const when = s.group === "Q" ? nextDeskSlot(parseYmd(today), settings, 7)?.day ?? plusDays(today, 1) : plusDays(today, 1);
    bits.push(`${inWords(redos.length).toLowerCase()} ${redos.length === 1 ? "tries" : "try"} again on ${DAY_NAMES[parseYmd(when).getDay()]}`);
  }
  if (moved) bits.push(`${inWords(moved).toLowerCase()} joined the stubborn ones, back in ten days`);
  if (bits.length) out.scheduled = `${bits.join("; ")}.`.replace(/^./, (c) => c.toUpperCase());
  if (linesWritten) out.cards = `${inWords(linesWritten)} ${linesWritten === 1 ? "line" : "lines"} went to your cards.`;
  return out;
}

// ---------------------------------------------------------------- mocks

export function mockGap(content: Content, week: number): [number, number] | null {
  const r = (content.benchmarks.rules as Rule[]).filter((x) => x.section === "mock" && x.week <= week).sort((a, b) => b.week - a.week)[0];
  return r?.gap_below_665 ?? null;
}

/**
 * Each official mock is judged against its own week's gap below your target: 50 at week 8, down to
 * 20 at week 12 (the plan's guides give the gaps; they're measured from your target, not a fixed 665).
 */
export function mockVerdict(content: Content, week: number, total: number, target: number): { onTrack: boolean; line: string } {
  const gap = mockGap(content, week);
  const below = target - total;
  if (below <= 0) return { onTrack: true, line: `${total}. At or above your target of ${target}.` };
  if (!gap || below <= gap[1]) return { onTrack: true, line: "On track for this point in the plan." };
  return { onTrack: false, line: `Further from ${target} than the plan expects here. A rebuild week before the next official mock uses it better.` };
}

// ---------------------------------------------------------------- "Need help?" chips

interface HelpEntry { cause: string; text: string; links: { text: string; url: string }[] }

/** The week's help link for the cause you actually hit (slips or content). */
export function helpFor(content: Content, week: number, section: Section, cause: "slips" | "content"): { title: string; url: string; youtubeId: string | null } | null {
  const help = content.plan.help as { week: number; section: string; entries: HelpEntry[] }[];
  const sec = section === "di" ? "di" : section;
  const list = help.filter((h) => h.section === sec && h.week <= week).sort((a, b) => b.week - a.week);
  for (const h of list) {
    const e = h.entries.find((x) => x.cause === cause && x.links.length);
    if (!e) continue;
    const l = e.links[0];
    const yt = l.url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
    return { title: l.text.replace(/^this /, "").replace(/^./, (c) => c.toUpperCase()), url: l.url, youtubeId: yt ? yt[1] : null };
  }
  return null;
}
