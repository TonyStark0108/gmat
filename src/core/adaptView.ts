// The adapting decisions in one place, for the model and the screens (spec: Adapting to you).

import { daysBetween, weekStartOf, type WeekCapacity } from "./calendar";
import type { Content, Section } from "./content";
import type { ExtraSpec, Tag } from "./events";
import type { MockResult } from "./mocks";
import type { Piece } from "./pieces";
import type { ReviewModel } from "./review";
import type { Derived } from "./state";
import {
  ADAPT_MIN_ATTEMPTS, difficultyFor, extraTopic, leadingTag, listsFor, sectionStats, topicStats, topicVideo, topupHistory,
  weakestSection, type AdaptSection, type TopicStat, type TopupOffer,
} from "./adapt";
import { listTopic, topicName } from "./topics";
import { confirmedTopics } from "./mastery";
import { lastFeelFor, paceOf, zoneOf, type Pace, type Zone } from "./flow";
import { weekNumber } from "./sunday";
import type { WeekPlan } from "./week";

export interface WorkOnGroup { heading: string; detail: string; count: number; topic: string; resting: string | null }

export interface AdaptView {
  stats: Map<string, TopicStat>;
  confirmed: Set<string>;         // topics with confirmed evidence: extra practice leaves them be
  zone: (topic: string) => Zone;  // the flow zone: stretch, flow, easy (or new)
  pace: (topic: string) => Pace;
  sections: ReturnType<typeof sectionStats>;
  weakest: AdaptSection | null;
  weight: (topic: string | null) => number;
  timingEarly: (section: Section) => boolean;
  carelessLeads: boolean;
  extraChip: (ws: string) => ExtraSpec | null;
  leanChip: (ws: string, cap: WeekCapacity) => ExtraSpec | null;
  keepSharp: (ws: string, always?: boolean) => ExtraSpec | null;
  topupSpec: (o: TopupOffer, ws: string) => ExtraSpec | null;
  topupLine: (o: TopupOffer) => string;
  history: (ws: string) => ReturnType<typeof topupHistory>;
  leanLine: (ws: string) => string | null;
  workOn: () => WorkOnGroup[];
}

const SEC_NAME: Record<string, string> = { quant: "quant", di: "DI", rc: "reading", cr: "CR" };

export function buildAdapt(content: Content, reviews: ReviewModel, d: Derived, byId: Map<string, Piece>, mocks: MockResult[], today: string): AdaptView {
  const stats = topicStats(reviews, d, byId, today);
  const confirmed = confirmedTopics(stats, reviews, today);
  const zone = (topic: string) => zoneOf(stats.get(topic), lastFeelFor(topic, d, byId, reviews, today));
  const pace = (topic: string) => paceOf(zone(topic), stats.get(topic));
  const open = new Map([...stats].filter(([k]) => !confirmed.has(k)));
  const sections = sectionStats(reviews, d);
  const lastMock = [...mocks].reverse().find((m) => m.official && m.quant !== null && m.verbal !== null && m.di !== null);
  const mockSec: Partial<Record<AdaptSection, number>> | undefined = lastMock
    ? { quant: lastMock.quant!, di: lastMock.di!, [(sections.get("rc")?.accuracy ?? 1) <= (sections.get("cr")?.accuracy ?? 1) ? "rc" : "cr"]: lastMock.verbal! }
    : undefined;
  // Verbal comes back: RC or CR under 70% on two desk sets in a row.
  const verbalBack = (["rc", "cr"] as const).find((s) => { const x = sections.get(s)?.sets ?? []; return x.length >= 2 && x.slice(-2).every((a) => a < 0.7); }) ?? null;
  const weakest = verbalBack ?? weakestSection(sections, mockSec);

  const weight = (topic: string | null) => {
    const st = topic ? stats.get(topic) : undefined;
    if (!st || st.attempts < ADAPT_MIN_ATTEMPTS) return 1;
    return Math.max(1, Math.min(1.6, 1 + (0.8 - st.accuracy)));
  };

  const weekTopic = (ws: string): string | null => {
    const w = d.weeks.get(ws);
    const ps = (w?.chips ?? []).map((c) => byId.get(c.pieceId)).filter((p) => p && p.task.kind === "gmatclub_set" && p.task.topic && (p.section === "quant" || p.section === "di"));
    return ps.length ? ps[ps.length - 1]!.task.topic! : null;
  };

  const weakTopicIn = (sec: Section): string | null => {
    const c = [...open.values()].filter((s) => s.section === sec && s.topic !== "mixed" && s.attempts >= 5).sort((a, b) => a.accuracy - b.accuracy);
    return c[0]?.topic ?? null;
  };

  const planWeekOf = (ws: string) => Math.max(0, ...(d.weeks.get(ws)?.chips ?? []).map((c) => byId.get(c.pieceId)?.planWeek ?? 0));
  const listSpec = (id: string, kind: ExtraSpec["kind"], ws: string, topic: string, section: Section, title: string, minutes: number, count: number, reason?: string): ExtraSpec | null => {
    const diff = difficultyFor(stats.get(topic), zone(topic));
    let urls = listsFor(content, topic, diff).slice(0, 2);
    // from plan week 8, quant and DS practice uses the harder lists you've pasted in: 655–705 first,
    // 705+ first once the topic is "hard" (80%+ on two separate sets)
    const hard = (d.settings.hardLists ?? {})[listTopic(topic)];
    if (planWeekOf(ws) >= 8 && (section === "quant" || section === "di") && hard && (hard.mid || hard.top)) {
      const mid = hard.mid ? [{ label: "655–705 list", url: hard.mid }] : [], top = hard.top ? [{ label: "705+ list", url: hard.top }] : [];
      urls = diff === "hard" ? [...top, ...mid] : [...mid, ...top];
    }
    if (!urls.length) return null;
    return { id, kind, week: ws, section, topic, title, minutes, open: { type: "list", urls, count }, reason };
  };

  const usedRc = new Set([...content.plan.tasks.filter((t) => t.kind === "rc_section").map((t) => t.pointer.section), ...[...d.extras.values()].filter((x) => x.open.type === "rc").map((x) => (x.open as { section: string }).section)]);

  const view: AdaptView = {
    stats, confirmed, zone, pace, sections, weakest, weight,
    timingEarly: (s) => leadingTag(stats, [s]) === "timing",
    carelessLeads: leadingTag(stats, ["quant", "di"]) === "careless",
    extraChip: (ws) => {
      const topic = extraTopic(open) ?? weekTopic(ws) ?? "arithmetic";
      const sec: Section = stats.get(topic)?.section === "di" || topic.startsWith("ds · ") ? "di" : "quant";
      const spec = listSpec(`extra:${ws}`, "extra", ws, topic, sec, `Extra · ${topicName(topic).toLowerCase()} · 10 questions`, 25, 10);
      return spec ? { ...spec, hidden: true } : null;
    },
    leanChip: (ws, cap) => {
      if (!weakest) return null;
      const minutes = Math.max(20, Math.min(60, Math.round(((cap.rawDesk + cap.rawBus) * 0.15) / 2)));
      const reason = `Next week leans ${SEC_NAME[weakest] === "quant" ? "quant" : SEC_NAME[weakest]}.`;
      if (weakest === "rc") {
        const sec = content.rc_bank.sections.find((s) => !usedRc.has(s.id));
        if (!sec) return null;
        return { id: `lean:${ws}`, kind: "lean", week: ws, section: "rc", topic: "rc", title: "An extra LSAT reading set", minutes: 60, open: { type: "rc", section: sec.id }, reason };
      }
      if (weakest === "cr") return listSpec(`lean:${ws}`, "lean", ws, "cr", "cr", "More CR · 10 questions", minutes, 10, reason);
      const topic = weakTopicIn(weakest) ?? (weakest === "di" ? "graphs & tables" : "word problems");
      return listSpec(`lean:${ws}`, "lean", ws, topic, weakest, `More ${SEC_NAME[weakest]} · ${topicName(topic).toLowerCase()}`, minutes, 10, reason);
    },
    keepSharp: (ws, always = false) => {
      if (!always && weekNumber(ws, d.settings.startDate) % 2) return null;      // every two weeks
      const timed = [...content.plan.tasks].reverse().find((t) => t.kind === "gmatclub_set" && t.timed && t.section === "quant" && t.pointer.lists_pool?.length);
      if (!timed) return null;
      const urls = timed.pointer.lists_pool!.slice(0, 4).map((l) => ({ label: `${l.topic ?? "mixed"}`, url: l.url }));
      return { id: `keepsharp:${ws}`, kind: "keepsharp", week: ws, section: "quant", topic: null, title: "A timed quant section, to keep sharp", minutes: 45, open: { type: "list", urls, count: 21 } };
    },
    topupSpec: (o, ws) => {
      const urls = listsFor(content, o.topic, "easy-first").slice(0, 3);
      if (!urls.length) return null;
      const v = topicVideo(content, o.topic);
      const n = [...d.extras.values()].filter((x) => x.kind === "topup" && x.topic === o.topic).length + 1;
      return {
        id: `topup:${o.topic}:${ws}:${n}`, kind: "topup", week: ws, section: o.section, topic: o.topic,
        title: `Top-up · ${topicName(o.topic).toLowerCase()} · 8 questions`, minutes: 30, open: { type: "list", urls, count: 8 },
        refresher: v ? { type: "video", youtubeId: v.youtubeId, url: v.url, title: v.title } : { type: "cards", topic: o.topic },
      };
    },
    topupLine: (o) => `${topicName(o.topic)} is shaky: ${o.wrong} of ${o.total} wrong${o.cause === "reading" ? "" : `, mostly ${o.cause}`}. Here are 8 more, easier ones first.`,
    history: (ws) => topupHistory(d, ws, today),
    leanLine: (ws) => d.extras.get(`lean:${ws}`)?.reason ?? null,
    workOn: () => {
      const hist = topupHistory(d, weekStartOf(today), today);
      const groups = new Map<string, { items: { line?: string; ts: number; unsureOnly: boolean }[]; topic: string; section: Section; tag: Tag | null }>();
      for (const it of reviews.items.values()) {
        if (!it.entered || it.firstMark === "unknown" || !["review", "redo", "return", "stubborn"].includes(it.state)) continue;
        const key = `${it.section}|${it.topic}|${it.tag ?? ""}`;
        const g = groups.get(key) ?? { items: [], topic: it.topic, section: it.section, tag: it.tag ?? null };
        g.items.push({ line: it.line, ts: d.tags.get(it.id)?.ts ?? 0, unsureOnly: it.firstMark === "right" });
        groups.set(key, g);
      }
      const out: WorkOnGroup[] = [...groups.values()].map((g) => {
        const own = g.items.filter((x) => x.line).sort((a, b) => b.ts - a.ts)[0]?.line;
        const tag = g.tag ? g.tag[0].toUpperCase() + g.tag.slice(1) : g.items.every((x) => x.unsureOnly) ? "Right, but not sure" : "Not tagged yet";
        const where = [SEC_NAME[g.section] ?? g.section, g.topic === "rc" || g.topic === "cr" ? null : topicName(g.topic).toLowerCase()].filter(Boolean).join(" · ");
        return { heading: own ? `${tag} — ${own}` : tag, detail: `${where} · ${g.items.length} of these`, count: g.items.length, topic: g.topic,
          resting: hist.resting.get(g.topic) ?? null };
      });
      out.sort((a, b) => Number(!!b.resting) - Number(!!a.resting) || b.count - a.count);
      return out.slice(0, 5);
    },
  };
  return view;
}

/** Adapting switches on around plan week 3, once a section has 15 attempts. */
export function adaptOn(m: { adapt: AdaptView; week: WeekPlan | null; byId: Map<string, Piece> }): boolean {
  const pw = Math.max(0, ...(m.week?.chips ?? []).map((c) => m.byId.get(c.pieceId)?.planWeek ?? 0));
  const enough = [...m.adapt.sections.values()].some((x) => x.attempts >= ADAPT_MIN_ATTEMPTS);
  return pw >= 3 && enough && !!m.adapt.weakest;
}

export const restingDays = (back: string, today: string) => daysBetween(today, back);
