// Everything the screens need, computed from the content file and the event log in one place, plus
// the records the app adds on its own (the week, weeks that counted, levels, new cards, the week's
// extra chip). Pure, so a whole simulated month can be tested without a browser.

import { adaptOn, buildAdapt, type AdaptView } from "./adaptView";
import { listsFor } from "./adapt";
import { plusDays, studyDay, weekCapacity, weekStartOf } from "./calendar";
import { buildCards, dueCards, introduceThisWeek, type StudyCard } from "./cards";
import type { Content, Section } from "./content";
import type { AppEvent, EventBody, ExtraSpec } from "./events";
import { buildExtras, extrasFor, reserveCr, reserveCrPiece, specToPiece, type ExtraPiece } from "./extras";
import { dateCheck, targetDate } from "./life";
import { endPhase, isReady, mockResults, type EndPhase, type MockResult } from "./mocks";
import { planTasks, toPieces, type Piece } from "./pieces";
import { levelFromWork, percentDone } from "./progress";
import { buildReviews, weekReviews, type ReviewModel, type SetReview } from "./review";
import { busOn, derive, gapDays, type Derived } from "./state";
import { WARM_WELCOME_AFTER } from "./life";
import { busChip, rideMinutes } from "./bus";
import { extraDeskFor, projectFinish, type WeekPlan } from "./week";
import { studyDaysLeft, weekCounts, weekEvents, weekPlanOf } from "./weekly";
import type { CardCtx } from "./card";
import type { MixChoice } from "./events";
import { recommendMix, sectionOfMix, type MixRec, type MixSection } from "./mix";
import { mixedSession } from "./review";
import { buildSuggestions, offerToday, recallSpecs, type Suggestions } from "./recall";

export interface Model {
  content: Content;
  now: Date;
  today: string;
  weekStart: string;
  d: Derived;
  plan: Piece[];
  extras: ExtraPiece[];
  byId: Map<string, Piece>;
  week: WeekPlan | null;
  weekExtras: ExtraPiece[];
  weekReviews: SetReview[];
  reviews: ReviewModel;
  cards: StudyCard[];
  cardsDue: number;
  sugg: Suggestions;
  adapt: AdaptView;
  mocks: MockResult[];
  ready: boolean;
  level: number;
  workLevel: number;
  pct: number;
  letGo: Set<string>;
  phase: EndPhase;
  ride: number;
  bus: boolean;
  busChip: boolean;
  back: boolean;
  online: boolean;
}

export function sectionOfFactory(plan: Map<string, Piece>, extras: Map<string, ExtraSpec>) {
  return (id: string): Section | undefined => {
    const p = plan.get(id);
    if (p) return p.section;
    if (id.startsWith("x:drill:")) return plan.get(`${id.split(":")[2]}#0`)?.section;
    if (id.startsWith("x:passage:")) return "rc";
    if (id.startsWith("x:")) return extras.get(id.slice(2).replace(/#0$/, ""))?.section;
    return undefined;
  };
}

export function buildModel(content: Content, events: AppEvent[], now: Date, online = true): Model {
  const today = studyDay(now);
  const first = derive(events);
  const s = first.settings;
  const plan = toPieces(planTasks(content, s), s);
  const planById = new Map(plan.map((p) => [p.id, p]));
  const d = derive(events, sectionOfFactory(planById, first.extras));
  const weekStart = weekStartOf(today);
  const reserve = reserveCr(content, d, today);
  const done = [...d.done].filter((id) => id.startsWith("x:reserve:")).map((id) => reserveCrPiece(content, id)).filter(Boolean) as ExtraPiece[];
  const tutorSets = [...d.extras.values()].filter((x) => x.kind === "tutor" && x.open.type === "book").map((x) => specToPiece(x, x.addedDay));
  const reviews = buildReviews({ content, pieces: [...plan, ...reserve, ...done, ...tutorSets], d, today, bookEditionMatches: s.bookEdition === "2025–2026" });
  const extras = [...buildExtras(content, plan, d, reviews, today), ...reserve, ...done];
  const byId = new Map<string, Piece>([...plan.map((p) => [p.id, p] as const), ...extras.map((x) => [x.id, x as Piece] as const)]);
  const week = weekPlanOf(d, weekStart, d.settings);
  const sugg = buildSuggestions(content, d, reviews, byId, today);
  const cards = buildCards(content, d, sugg.kept);
  const letGo = new Set([...d.letgo.entries()].filter(([, keep]) => !keep).map(([t]) => t));
  const mocks = mockResults(plan, d);
  const ready = isReady(mocks, s.target ?? 685);
  const adapt = buildAdapt(content, reviews, d, byId, mocks, today);
  const errorsHalf = reviews.errorsSoFar === 0 || reviews.retired >= reviews.errorsSoFar / 2;
  return {
    content, now, today, weekStart, d, plan, extras, byId, week,
    weekExtras: extrasFor(extras, weekStart, today, d),
    weekReviews: weekReviews(reviews, weekStart, d.settings),
    reviews, cards, cardsDue: dueCards(cards, now.getTime()).length, sugg, adapt, mocks, ready,
    // Level 7 is Ready, recomputed from the mocks every time and never stored; levels 1–6 count work done
    level: ready ? 7 : Math.max(Math.min(d.level, 6), levelFromWork(plan, d.done, errorsHalf)),
    workLevel: Math.max(Math.min(d.level, 6), levelFromWork(plan, d.done, errorsHalf)),
    pct: percentDone(plan, d.done, letGo), letGo, phase: endPhase(d.settings.testDate, today),
    ride: rideMinutes(d, now.getTime()), bus: busOn(d, now.getTime()), busChip: !busOn(d, now.getTime()) && busChip(d, now),
    back: gapDays(d, today) >= WARM_WELCOME_AFTER && !d.seen.has(`back:${today}`) && d.setupDone && today > d.settings.startDate,
    online,
  };
}

/** Required chips left this week, and whether the week's reviews are all done. */
export function weekStatus(m: Model, ws = m.weekStart) {
  const plan = weekPlanOf(m.d, ws, m.d.settings);
  const end = plusDays(ws, 6);
  const reviews = weekReviews(m.reviews, ws, m.d.settings);
  const reviewsDone = reviews.every((r) => m.d.reviewDone.has(r.id) && m.d.reviewDone.get(r.id)!.day <= end);
  return { plan, reviews, reviewsDone };
}

/** Records the app adds on its own. Run until it returns nothing. */
export function upkeep(m: Model): EventBody[] {
  const { d, today, plan, content } = m;
  const s = d.settings;
  if (!d.setupDone) return [];
  const out: EventBody[] = [];
  const ws = m.weekStart;
  const isNewWeek = today >= s.startDate && !d.weeks.has(ws);

  out.push(...weekEvents(plan, d, s, today, m.ride, m.letGo));

  // At the start of every calendar week (including after weeks the app was never opened), compare the
  // projected finish with the agreed one. Only a finish date that stops working shows anything.
  if (isNewWeek && d.setupDay && ws > weekStartOf(s.startDate) && !d.datechecks.some((x) => x.week === ws)) out.push(dateCheckEvent(m, ws));

  // new starter cards: about 15 a week from the start, slower if cards pile up
  if (today >= s.startDate && !d.introWeeks.has(ws)) {
    const ids = introduceThisWeek(content, d, m.cardsDue);
    out.push({ type: "cards.introduced", week: ws, ids });
  }

  // the week's extra chip (hidden until the required chips are done) and the lean toward the weakest section
  if (today >= s.startDate && d.weeks.has(ws)) {
    for (const x of weekExtrasFor(m)) if (!d.extras.has(x.id)) out.push({ type: "extra.added", extra: x });
  }

  // the day's new cards: a few of the waiting suggestions, once a day
  if (today >= s.startDate) {
    const ids = offerToday(m.sugg, d, today, m.cardsDue);
    if (ids) out.push({ type: "cards.offered", day: today, ids });
  }

  // bringing things back: your error log from memory, the sweep before a mock, the week's recap, fresh-question checks
  if (today >= s.startDate && d.weeks.has(ws)) {
    for (const x of recallSpecs(m)) if (!d.extras.has(x.id)) out.push({ type: "extra.added", extra: x });
  }

  // weeks that now count
  for (const [w] of d.weeks) {
    if (d.counted.has(w)) continue;
    const st = weekStatus(m, w);
    if (st.plan && weekCounts(st.plan, d, today, st.reviewsDone)) out.push({ type: "week.counted", week: w });
  }
  if (m.workLevel > d.level) out.push({ type: "level", level: m.workLevel });
  if (s.agreedFinish === null && d.setupDone && plan.length) {
    const from = today > s.startDate ? today : s.startDate;
    const p = projectFinish({ pieces: plan, done: d.done, settings: s, fromWeek: weekStartOf(from), fromDay: from, busMinutes: m.ride });
    if (p.finish) out.push({ type: "settings", patch: { agreedFinish: s.finishDate ?? p.finish } });
  }
  return out;
}

/** The date check: does the required work left fit before the finish date (or the test)? */
export function dateCheckEvent(m: Model, ws = m.weekStart): Extract<EventBody, { type: "datecheck" }> {
  const s = m.d.settings;
  const from = m.today > s.startDate ? m.today : s.startDate;
  const args = { pieces: m.plan, done: new Set([...m.d.done, ...m.plan.filter((p) => m.letGo.has(p.taskId)).map((p) => p.id)]), settings: s,
    fromWeek: weekStartOf(from), fromDay: from, busMinutes: m.ride };
  const projected = projectFinish(args).finish;
  const target = targetDate(s);
  let extra: number | null = null;
  if (target && projected && projected > target) extra = extraDeskFor(target, args)?.extraPerWeek ?? null;
  const c = dateCheck(projected, target, extra);
  return { type: "datecheck", week: ws, result: c.result, projected: c.projected, target: c.target, extra: c.extraPerWeek };
}

/** The week's extra chip and the lean chip, decided once at the start of the week. */
export function weekExtrasFor(m: Model): ExtraSpec[] {
  const out: ExtraSpec[] = [];
  const ws = m.weekStart;
  const allDone = m.plan.every((p) => m.d.done.has(p.id) || m.letGo.has(p.taskId));
  if (m.phase === "taper" || m.phase === "testweek") return out;
  const extra = m.adapt.extraChip(ws);
  if (extra) out.push(extra);
  if (adaptOn(m)) {
    const lean = m.adapt.leanChip(ws, weekCapacity(ws, m.d.settings));
    if (lean) out.push(lean);
  }
  // a rebuild week: the section's basics come back while its new plan work waits
  for (const r of m.d.settings.rebuild ?? []) {
    if (r.week !== ws) continue;
    const v = m.content.plan.tasks.find((t) => t.kind === "video" && t.section === r.section && t.pointer.youtube_id);
    if (v) out.push({ id: `rebuild:${ws}:video`, kind: "rebuild", week: ws, section: r.section, topic: null, title: `Basics again: ${v.title}`, minutes: v.est_minutes || 15,
      open: { type: "video", youtubeId: v.pointer.youtube_id!, url: v.pointer.url ?? "" } });
    const topic = m.content.plan.tasks.find((t) => t.kind === "gmatclub_set" && t.section === r.section && t.topic)?.topic;
    const urls = topic ? listsFor(m.content, topic, "easy").slice(0, 2) : [];
    if (urls.length) out.push({ id: `rebuild:${ws}:list`, kind: "rebuild", week: ws, section: r.section, topic: topic!, title: `Basics again: ${topic} · 15 questions`, minutes: 40,
      open: { type: "list", urls, count: 15 } });
  }
  if (allDone && !m.d.settings.testDate) {
    const ks = m.adapt.keepSharp(ws);
    if (ks) out.push(ks);
  }
  return out;
}

/** What the card chooser needs right now, including today's mix and its recommendation. */
export function cardContext(m: Model, opts: { bus?: boolean; online?: boolean } = {}): { ctx: CardCtx; rec: MixRec; chosen: MixChoice } {
  const { d, today, week } = m;
  const bus = opts.bus ?? m.bus, online = opts.online ?? m.online;
  const remaining: Record<MixSection, number> = { quant: 0, verbal: 0, di: 0 };
  for (const c of week?.chips ?? []) {
    const p = m.byId.get(c.pieceId);
    const s = p && sectionOfMix(p.section);
    if (p && s && !d.done.has(p.id)) remaining[s] += p.minutes;
  }
  const waiting: Record<MixSection, { redos: number; topUp: boolean }> = { quant: { redos: 0, topUp: false }, verbal: { redos: 0, topUp: false }, di: { redos: 0, topUp: false } };
  for (const it of mixedSession(m.reviews, d, today, { bus: false, online, morning: false })) {
    const s = sectionOfMix(it.section);
    if (s) waiting[s].redos++;
  }
  for (const x of m.weekExtras) {
    const s = sectionOfMix(x.section);
    if (s && x.xkind === "topup" && !d.done.has(x.id)) waiting[s].topUp = true;
  }
  const seen = (s: Section) => d.lastSeen.get(s) ?? null;
  const maxDay = (x: string | null, y: string | null) => (x && y ? (x > y ? x : y) : x ?? y);
  const earlier = [...d.mixByDay.entries()].filter(([day]) => day < today).sort((x, y) => (x[0] < y[0] ? 1 : -1))[0];
  const rec = recommendMix({
    today, remaining, studyDaysLeft: studyDaysLeft(today, d.settings), waiting,
    lastSeen: { quant: seen("quant"), di: seen("di"), verbal: maxDay(seen("rc"), seen("cr")) },
    lastSessionChoice: earlier ? { day: earlier[0], choice: earlier[1] } : null,
    planStarted: d.settings.startDate, minutesToday: d.timechipByDay.get(today) ?? null,
  });
  const chosen: MixChoice = d.mixByDay.get(today) ?? rec.choice;
  const ctx: CardCtx = {
    now: m.now, today, settings: d.settings, pieces: m.plan, byId: m.byId, week, d, bus, online,
    mix: chosen, first: chosen === "mix" ? rec.first : undefined, timeBudget: d.timechipByDay.get(today) ?? null,
    reviews: m.reviews, extras: m.weekExtras, cardsDue: m.cardsDue, phase: m.phase, back: m.back, letGo: m.letGo, topicWeight: m.adapt.weight,
  };
  return { ctx, rec, chosen };
}
