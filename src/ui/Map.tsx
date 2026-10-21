// The map (a path of every task, by plan week). Done weeks fold into one line; the week you're in is
// open, one circle per task; later weeks show only a count and what they're about. A circle on this
// week's chips can be started from here, like the week screen; later ones can only be looked at.

import { useEffect, useMemo, useRef, useState } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { chooseCard } from "../core/card";
import { buildMap, type MapNode, type MapUnit } from "../core/map";
import { coverage } from "../core/recall";
import { cardContext } from "../core/model";
import { record } from "../data/db";
import { Back, Screen } from "./bits";
import { SUBJECT } from "./copy";
import { useFocus } from "./focus";

const GLYPH: Record<string, string> = {
  video: "▶", test_prep: "♡", article: "≡", og_set: "✎", rc_section: "¶", cr_set: "∴", gmatclub_set: "≣", di_set: "◫",
  drill: "⏱", mock: "★", admin: "•", cards: "▤",
};

export function MapScreen() {
  const { m, d, bus, online } = useApp();
  const focus = useFocus();
  const card = useMemo(() => chooseCard(cardContext(m, { bus, online }).ctx), [m, bus, online]);
  const nextPiece = "piece" in card ? card.piece.id : null;
  const map = useMemo(() => buildMap(m, nextPiece), [m, nextPiece]);
  const cov = useMemo(() => coverage(m), [m]);
  const [openDone, setOpenDone] = useState<Set<number>>(new Set());
  const [peek, setPeek] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const here = useRef<HTMLDivElement>(null);
  // open on the next circle, so what's done sits above and what's left below
  useEffect(() => { (document.querySelector(".map-node.next") ?? here.current)?.scrollIntoView({ block: "center" }); }, []);

  const start = async (n: MapNode) => {
    const p = n.pieceIds.map((id) => m.byId.get(id)!).find((x) => x && !d.done.has(x.id));
    if (!p) return;
    if (!d.started.has(p.id)) await record({ type: "piece.started", piece: p.id, mode: bus ? "bus" : "desk" });
    if (!bus) focus.startSitting();
    go(`/task/${encodeURIComponent(p.id)}`);
  };
  const toggle = (set: Set<number>, w: number) => { const x = new Set(set); if (x.has(w)) x.delete(w); else x.add(w); return x; };

  return (
    <Screen>
      <div className="column" style={{ gap: 14 }}>
        <Back />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="eyebrow">The map</div>
            <div style={{ fontSize: 54, lineHeight: 0.95 }}>{m.pct}%</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18 }}>{map.doneTasks} of {map.totalTasks} tasks</div>
            <div className="small">about {map.hoursLeft} hours of the plan left</div>
          </div>
        </div>
        <div className="bar" style={{ height: 8 }}><div style={{ width: `${m.pct}%`, background: "var(--ink)" }} /></div>
        <button className="map-covered" onClick={() => go("/coverage")}>
          <span>{cov.started} of {cov.total} topics started · {cov.missingCards.length ? `${cov.missingCards.length} without cards` : "every one has its cards"} · {cov.comingBack} {cov.comingBack === 1 ? "mistake" : "mistakes"} coming back{cov.look ? ` · ${cov.look} worth another look` : ""}{cov.confirmed ? ` · ${cov.confirmed} confirmed` : ""}</span>
          <span className="tiny">what's covered →</span>
        </button>

        {map.units.map((u) => {
          const isHere = u.state === "current" && u.week === map.currentWeek;
          return (
            <div key={u.week} ref={isHere ? here : undefined} style={{ display: "flex", flexDirection: "column", gap: 10, scrollMarginTop: 12 }}>
              {u.state === "done" && !openDone.has(u.week) ? (
                <button className="map-done" onClick={() => setOpenDone((s) => toggle(s, u.week))}>
                  <span className="map-check">✓</span>
                  <span style={{ flex: 1, textAlign: "left" }}>Week {u.week} · {u.about}</span>
                  <span className="tiny">{u.total} done</span>
                </button>
              ) : u.state === "later" && !peek.has(u.week) ? (
                <button className="map-later" onClick={() => setPeek((s) => toggle(s, u.week))}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontSize: 18 }}>Week {u.week}</span>
                    <span className="tiny">{u.done ? `${u.done} of ${u.total} done` : `${u.total} tasks`} · about {Math.max(1, Math.round(u.minutesLeft / 60))} h</span>
                  </div>
                  <div className="small" style={{ textAlign: "left" }}>{u.about}</div>
                </button>
              ) : (
                <Unit u={u} picked={picked} onPick={(id) => setPicked((p) => (p === id ? null : id))} onStart={start}
                  onFold={u.state === "done" ? () => setOpenDone((s) => toggle(s, u.week)) : u.state === "later" ? () => setPeek((s) => toggle(s, u.week)) : undefined} />
              )}
              {u.levelAfter && <LevelBadge n={u.levelAfter.n} name={u.levelAfter.name} reached={m.level >= u.levelAfter.n} />}
            </div>
          );
        })}
        <LevelBadge n={7} name="Ready" reached={m.ready} note={`Your last two fresh official mocks within 10 of ${d.settings.target}, the latest not lower.`} />
        <div className="tiny" style={{ textAlign: "center" }}>Colour is the subject. ✓ done · half ring: half done · glow: next. Later weeks open when you get there.</div>
      </div>
    </Screen>
  );
}

function Unit({ u, picked, onPick, onStart, onFold }: { u: MapUnit; picked: string | null; onPick: (id: string) => void; onStart: (n: MapNode) => void; onFold?: () => void }) {
  return (
    <div className="map-unit">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20 }}>Week {u.week}</div>
          <div className="small">{u.about}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="tiny">{u.done} of {u.total} done</div>
          {onFold && <button className="back" onClick={onFold}>fold</button>}
        </div>
      </div>
      <div className="bar"><div style={{ width: `${u.total ? (100 * u.done) / u.total : 0}%`, background: "var(--ink)" }} /></div>
      <div className="map-path">
        {u.nodes.map((n, i) => {
          const k = SUBJECT[n.section];
          const x = Math.round(Math.sin(i * 0.8) * 64);
          const later = u.state === "later" || n.status === "later";
          return (
            <div key={n.taskId} style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateX(${x}px)` }}>
              <button className={`map-node ${n.status}`} aria-label={`${n.title}: ${n.status === "done" ? "done" : n.status === "next" ? "next up" : n.status === "half" ? "half done" : "to do"}`}
                onClick={() => onPick(n.taskId)}
                style={{ ["--c" as string]: k.c, ["--t" as string]: k.t, ["--d" as string]: k.d, opacity: later && n.status !== "done" ? 0.55 : 1 }}>
                {n.status === "done" ? "✓" : GLYPH[n.kind] ?? "•"}
              </button>
              {n.status === "next" && picked !== n.taskId && <div className="map-tag" style={{ background: k.c }}>next</div>}
              {picked === n.taskId && (
                <div className="map-pop">
                  <div className="eyebrow" style={{ color: k.d }}>{k.name}</div>
                  <div style={{ fontSize: 17 }}>{n.title}</div>
                  <div className="tiny">about {n.minutes} minutes · {n.status === "done" ? "done" : n.status === "half" ? "half done" : "to do"}</div>
                  {n.status !== "done" && (n.inThisWeek
                    ? <button className="btn small" style={{ background: k.c, borderColor: k.c }} onClick={() => onStart(n)}>Start</button>
                    : <div className="small">Comes up with plan week {u.week}, in order.</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LevelBadge({ n, name, reached, note }: { n: number; name: string; reached: boolean; note?: string }) {
  return (
    <div className={`map-level${reached ? " reached" : ""}`}>
      <span className="map-crown">{reached ? "★" : n}</span>
      <div>
        <div style={{ fontSize: 17 }}>Level {n} · {name}</div>
        {note && <div className="tiny">{note}</div>}
      </div>
    </div>
  );
}
