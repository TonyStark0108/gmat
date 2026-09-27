import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { studyDay, weekStartOf } from "../core/calendar";
import { now } from "../core/clock";
import type { Content } from "../core/content";
import type { AppEvent } from "../core/events";
import { planTasks, toPieces, type Piece } from "../core/pieces";
import { levelFromWork } from "../core/progress";
import { busOn, derive, type Derived } from "../core/state";
import { countedEvents, planKey, weekEvents, weekPlanOf } from "../core/weekly";
import type { WeekPlan } from "../core/week";
import { db, devContent, record, storedContent } from "../data/db";

export interface App {
  content: Content | null;
  contentState: "loading" | "missing" | "ready";
  setContent: (c: Content) => void;
  events: AppEvent[];
  d: Derived;
  pieces: Piece[];
  byId: Map<string, Piece>;
  now: Date;
  today: string;
  week: WeekPlan | null;
  bus: boolean;
  online: boolean;
  refresh: () => void;
}

const Ctx = createContext<App | null>(null);

export function useApp(): App {
  const a = useContext(Ctx);
  if (!a) throw new Error("useApp outside AppProvider");
  return a;
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null);
  const [contentState, setContentState] = useState<App["contentState"]>("loading");
  const events = useLiveQuery(() => db.events.orderBy("ts").toArray(), [], null);
  const [tick, setTick] = useState(0);
  const online = useOnline();

  useEffect(() => {
    (async () => {
      const c = (await storedContent()) ?? (await devContent());
      setContent(c);
      setContentState(c ? "ready" : "missing");
    })();
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const nowD = useMemo(() => now(), [tick, events]);   // eslint-disable-line react-hooks/exhaustive-deps
  const today = studyDay(nowD);
  const settingsOnly = useMemo(() => derive(events ?? []).settings, [events]);
  const key = planKey(settingsOnly);
  const pieces = useMemo(() => (content ? toPieces(planTasks(content, settingsOnly), settingsOnly) : []), [content, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const d = useMemo(() => derive(events ?? [], (id) => byId.get(id)?.section), [events, byId]);
  const week = useMemo(() => weekPlanOf(d, weekStartOf(today), d.settings), [d, today]);

  // Keep the week built and the numbers that only go up recorded.
  const busy = useRef(false);
  useEffect(() => {
    if (!events || !content || !d.setupDone || busy.current) return;
    const todo = [...weekEvents(pieces, d, d.settings, today), ...countedEvents(d, d.settings, today)];
    const lvl = levelFromWork(pieces, d.done);
    if (lvl > d.level) todo.push({ type: "level", level: lvl });
    if (!todo.length) return;
    busy.current = true;
    (async () => {
      for (const e of todo) await record(e);
      busy.current = false;
    })();
  }, [events, content, d, pieces, today]);

  const app: App = {
    content, contentState, setContent: (c) => { setContent(c); setContentState("ready"); },
    events: events ?? [], d, pieces, byId, now: nowD, today, week,
    bus: busOn(d, nowD.getTime()), online, refresh: () => setTick((x) => x + 1),
  };
  if (events === null) return null;
  return <Ctx.Provider value={app}>{children}</Ctx.Provider>;
}
