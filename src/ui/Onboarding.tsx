// Getting started: a short welcome before setup (what the app is, in four screens), a guided tour of
// home the first time you see it (and again from Settings), and a one-time tip on each main screen.
// All of it is skippable, keyboard-friendly, and remembered in your history so it never repeats.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { record } from "../data/db";
import { Screen, useKeys } from "./bits";

/** Automated test browsers skip the tour and tips unless a test asks for them (#/?tour=1). */
const robot = () => typeof navigator !== "undefined" && navigator.webdriver;

// ------------------------------------------------------------------ the welcome, before setup

export const SLIDES: { eb: string; title: string; body: string; art: "card" | "week" | "loop" | "flow" }[] = [
  { eb: "Welcome", title: "One card. That's the app.", art: "card",
    body: "Every time you open it, one card says what to do next: the task, where it is, about how long. You never plan, choose, or keep notes anywhere else." },
  { eb: "Your weeks", title: "Built for your week, not a perfect one.", art: "week",
    body: "Quant and DI go to your desk time (Saturday and your mornings). Reading, videos, CR and cards fit the bus. Never more than 15 hours a week, and a lost week is absorbed quietly." },
  { eb: "What sticks", title: "Mistakes come back until they stick.", art: "loop",
    body: "A set's review arrives a day or so later, answers hidden, so you retry from scratch. Every miss returns until it's right twice, a week apart. Rules and traps become cards." },
  { eb: "Your pace", title: "Pitched in your flow zone.", art: "flow",
    body: "Too hard and it eases off: easier questions, no clock. Too easy and it steps up. One tap after each set tells it how it felt, and your results do the rest." },
];

export function Welcome() {
  const [i, setI] = useState(0);
  const done = () => void record({ type: "seen", what: "intro" });
  const next = () => (i < SLIDES.length - 1 ? setI(i + 1) : done());
  useKeys({ Enter: next, ArrowRight: next, ArrowLeft: () => setI(Math.max(0, i - 1)), Escape: done }, [i]);
  const s = SLIDES[i];
  return (
    <Screen>
      <div className="column welcome" style={{ gap: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="eyebrow">{s.eb}</span>
          <button className="back" onClick={done}>Skip the intro</button>
        </div>
        <Art kind={s.art} key={s.art} />
        <div key={`t${i}`} className="welcome-text">
          <div className="title" style={{ fontSize: 34 }}>{s.title}</div>
          <div className="muted" style={{ fontSize: 18, lineHeight: 1.45, marginTop: 10 }}>{s.body}</div>
        </div>
        <div className="spacer" />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 6 }} aria-label={`${i + 1} of ${SLIDES.length}`}>
            {SLIDES.map((_, k) => <span key={k} className={`pager${k === i ? " on" : ""}`} />)}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {i > 0 && <button className="btn ghost small" style={{ minWidth: 92 }} onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn small" style={{ minWidth: 170 }} autoFocus onClick={next}>{i < SLIDES.length - 1 ? "Next" : "Set up your dates"}</button>
          </div>
        </div>
      </div>
    </Screen>
  );
}

/** A small paper-and-depth illustration for each welcome screen. */
function Art({ kind }: { kind: "card" | "week" | "loop" | "flow" }) {
  const tilt = useTilt<HTMLDivElement>();
  return (
    <div className="art" ref={tilt}>
      {kind === "card" && (
        <div className="art-stack">
          <div className="art-sheet back2" /><div className="art-sheet back1" />
          <div className="art-sheet front"><span className="row" style={{ gap: 6 }}><span className="art-dot" style={{ background: "var(--q)" }} /><b>Quant</b></span><span>OG problem solving, first half</span><span className="art-btn">Start</span></div>
        </div>
      )}
      {kind === "week" && (
        <div className="art-week">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, k) => (
            <div key={d} className="art-day" style={{ ["--k" as string]: k }}>
              <span>{d}</span>
              {k < 5 && <i style={{ background: "var(--rc)" }} />}
              {(k === 1 || k === 2 || k === 3) && <i style={{ background: "var(--q)" }} />}
              {k === 5 && <><i style={{ background: "var(--q)" }} /><i style={{ background: "var(--di)" }} /><i style={{ background: "var(--mk)" }} /></>}
            </div>
          ))}
        </div>
      )}
      {kind === "loop" && (
        <div className="art-loop">
          {["set", "review", "return", "retired"].map((w, k) => <div key={w} className="art-step" style={{ ["--k" as string]: k }}>{w}</div>)}
        </div>
      )}
      {kind === "flow" && (
        <div className="art-flow">
          <div className="zone z-easy">easy<small>harder next</small></div>
          <div className="zone z-flow">flow<small>just right</small></div>
          <div className="zone z-stretch">stretch<small>easier, no clock</small></div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the guided tour of home

export interface TourStep { target: string; title: string; body: string }

export const HOME_TOUR: TourStep[] = [
  { target: "card", title: "The card", body: "The one thing to do now. Start does it; Skip offers one other thing. It already knows whether you're at a desk, on the bus, or short of time." },
  { target: "mix", title: "Today's mix", body: "A bit of everything, or one section today. The recommended one is already picked; tap another to change it for today." },
  { target: "level", title: "Where you are", body: "Your level in the whole prep, the share of the plan done, and the hours you've put in. These numbers never go down." },
  { target: "retired", title: "Mistakes retired", body: "Each one came right twice, a week apart. Tap to see what to work on: your mistakes grouped, in your own words." },
  { target: "bus", title: "On the bus", body: "Tap Bus (or press B) when you sit down on a ride. The card switches to reading, videos, CR and cards, and works with no signal." },
  { target: "life", title: "When life happens", body: "A busy night, a weekend, a whole week: tell the app and it re-spreads the work. Nothing turns red." },
  { target: "nav", title: "Everything else, one level down", body: "This week's tasks, the map of the whole plan, your progress, what to work on, the tutor and settings. You never need them to know what's next." },
];

export function useTour(steps: TourStep[], id: string, forced: boolean) {
  const { d } = useApp();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (forced || (!robot() && d.setupDone && !d.seen.has(`tour:${id}`))) setOn(true);
  }, [forced]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => { setOn(false); if (!d.seen.has(`tour:${id}`)) void record({ type: "seen", what: `tour:${id}` }); if (forced) go("/"); };
  // drawn at the top of the page, outside the app's frame, so nothing shifts or clips it
  return { on, finish, node: on ? createPortal(<Tour steps={steps} onDone={finish} />, document.body) : null };
}

function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const live = steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const s = live[i];
  useLayoutEffect(() => {
    if (!s) return;
    const el = document.querySelector(`[data-tour="${s.target}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const place = () => setRect(el.getBoundingClientRect());
    place();
    const t = setTimeout(place, 380);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [i, s?.target]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => (i < live.length - 1 ? setI(i + 1) : onDone());
  useKeys({ Enter: next, ArrowRight: next, ArrowLeft: () => setI(Math.max(0, i - 1)), Escape: onDone }, [i, live.length]);
  if (!s || !rect) return null;
  const pad = 8;
  const below = rect.bottom + 230 < window.innerHeight || rect.top < 240;
  const w = Math.min(340, window.innerWidth - 32);
  const left = Math.max(16, Math.min(window.innerWidth - w - 16, rect.left + rect.width / 2 - w / 2));
  return (
    <div className="tour" role="dialog" aria-label={`Tour: ${s.title}`}>
      <div className="tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className="tour-tip" key={i} style={{ width: w, left, ...(below ? { top: rect.bottom + 16 } : { bottom: window.innerHeight - rect.top + 16 }) }}>
        <div className="eyebrow">{i + 1} of {live.length}</div>
        <div style={{ fontSize: 22, lineHeight: 1.15 }}>{s.title}</div>
        <div style={{ fontSize: 16, lineHeight: 1.45, color: "var(--ink-2)" }}>{s.body}</div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          <button className="back" onClick={onDone}>Skip the tour</button>
          <div className="row" style={{ gap: 6 }}>
            {i > 0 && <button className="btn ghost small" style={{ height: 40, minWidth: 70 }} onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn small" style={{ height: 40, minWidth: 90 }} autoFocus onClick={next}>{i < live.length - 1 ? "Next" : "Done"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ one-time tips on the main screens

export function Tip({ id, children }: { id: string; children: ReactNode }) {
  const { d } = useApp();
  const [gone, setGone] = useState(false);
  if (gone || robot() || d.seen.has(`tip:${id}`)) return null;
  return (
    <div className="tip" role="note">
      <span className="tip-mark">i</span>
      <div style={{ flex: 1, fontSize: 16, lineHeight: 1.45 }}>{children}</div>
      <button className="btn ghost small" style={{ height: 36, minWidth: 74 }} onClick={() => { setGone(true); void record({ type: "seen", what: `tip:${id}` }); }}>Got it</button>
    </div>
  );
}

// ------------------------------------------------------------------ depth: a card that tilts toward the cursor

/** Tilts an element a few degrees toward the pointer, with a soft sheen. Off for touch and reduced motion. */
export function useTilt<T extends HTMLElement>(max = 5) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    el.classList.add("tilt");
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--ry", `${(x - 0.5) * 2 * max}deg`);
        el.style.setProperty("--rx", `${(0.5 - y) * 2 * max}deg`);
        el.style.setProperty("--gx", `${x * 100}%`);
        el.style.setProperty("--gy", `${y * 100}%`);
      });
    };
    const leave = () => { cancelAnimationFrame(raf); el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); el.classList.remove("tilt"); };
  }, [max]);
  return ref;
}
