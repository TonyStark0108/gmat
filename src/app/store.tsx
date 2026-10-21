import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { studyDay } from "../core/calendar";
import { now } from "../core/clock";
import type { Content } from "../core/content";
import type { AppEvent } from "../core/events";
import { videosToCheck } from "../core/links";
import { buildModel, upkeep, type Model } from "../core/model";
import type { Piece } from "../core/pieces";
import { derive, type Derived } from "../core/state";
import type { WeekPlan } from "../core/week";
import { db, devContent, record, storedContent } from "../data/db";
import { autoBackup } from "../data/backup";

export interface App {
  content: Content | null;
  contentState: "loading" | "missing" | "ready";
  setContent: (c: Content) => void;
  events: AppEvent[];
  m: Model;
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

const EMPTY: Content = {
  format: "gmat-content", version: "none", plan: { tasks: [], settings_defaults: {}, section_text: {}, help: [] }, rc_bank: { sections: [] },
  cr_bank: { default_sets: [], reserve_sets: [], has_official_answers: false }, book_keys: { books: {} as Content["book_keys"]["books"] },
  links: { links: [] }, benchmarks: { rules: [] }, decks: { quant_facts: [], method: [] },
};

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
  const m = useMemo(() => buildModel(content ?? EMPTY, events ?? [], nowD, online), [content, events, nowD, online]);
  const d = content ? m.d : derive(events ?? []);

  // Keep the week built and the numbers that only go up recorded.
  const busy = useRef(false);
  useEffect(() => {
    if (!events || !content || !d.setupDone || busy.current) return;
    const todo = upkeep(m);
    if (!todo.length) return;
    busy.current = true;
    (async () => {
      for (const e of todo) await record(e);
      busy.current = false;
    })();
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once a week, with signal: check the plan's videos through YouTube's public oEmbed service, so a
  // dead one is swapped before you reach it. GMAT Club links are never checked: its terms forbid it.
  const checking = useRef(false);
  useEffect(() => {
    if (!content || !online || !d.setupDone || checking.current) return;
    const due = videosToCheck(content, m.d, nowD.getTime());
    if (!due.length) return;
    checking.current = true;
    (async () => {
      for (const v of due.slice(0, 60)) {
        try {
          const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.youtubeId}`)}`);
          await record({ type: "video.check", youtubeId: v.youtubeId, status: r.status });
        } catch { break; }    // no signal after all: try again another time
      }
      checking.current = false;
    })();
  }, [content, online, d.setupDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // A backup every day, automatically, into the folder you picked (spec change: daily, not weekly).
  const backedUp = useRef<string | null>(null);
  useEffect(() => {
    if (!content || !d.setupDone || backedUp.current === studyDay(nowD)) return;
    const last = d.lastBackup ? studyDay(new Date(d.lastBackup)) : null;
    backedUp.current = studyDay(nowD);
    if (last === studyDay(nowD)) return;
    void autoBackup();
  }, [content, d.setupDone, nowD]); // eslint-disable-line react-hooks/exhaustive-deps

  const app: App = {
    content, contentState, setContent: (c) => { setContent(c); setContentState("ready"); },
    events: events ?? [], m, d, pieces: m.plan, byId: m.byId, now: nowD, today: studyDay(nowD), week: m.week,
    bus: m.bus, online, refresh: () => setTick((x) => x + 1),
  };
  if (events === null) return null;
  return <Ctx.Provider value={app}>{children}</Ctx.Provider>;
}
