// The progress page and the errors page (spec: Progress page; What to work on). The journey at the top,
// a climbing line, section bars that only fill, the one scarcity shown, and official mocks as dots.
// The errors page is the only place accuracy appears.

import { useMemo } from "react";
import { useApp } from "../app/store";
import { shortDate } from "../core/calendar";
import { climb, milestones, readingSetsLeft, sectionBars, whatsLeftFor } from "../core/milestones";
import { LEVELS } from "../core/progress";
import { go } from "../app/router";
import { Back, Screen } from "./bits";

export function ProgressScreen() {
  const { m, d, today } = useApp();
  const line = useMemo(() => climb(m.plan, d, d.settings, today, m.ride), [m.plan, d, today, m.ride]);
  const bars = sectionBars(m.plan, d.done);
  const rs = m.content ? readingSetsLeft(m.content, m.plan, d.done) : null;
  const ms = milestones(m.plan, d, m.reviews, m.mocks, m.pct);
  const W = 640, H = 170, pad = 24;
  const n = Math.max(line.length - 1, 1);
  const x = (i: number) => pad + ((W - 2 * pad) * i) / n;
  const y = (p: number) => H - pad - ((H - 2 * pad) * p) / 100;
  const actual = line.filter((p) => p.pct !== null);
  return (
    <Screen>
      <div className="column">
        <Back />
        <div className="title">Progress</div>

        <div className="eyebrow">The journey</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {LEVELS.map((L) => {
            const reached = m.level >= L.n, current = m.level + 1 === L.n;
            return (
              <div key={L.n} className="row" style={{ gap: 12, alignItems: "flex-start", opacity: reached || current ? 1 : 0.55 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid var(--ink)", background: reached ? "var(--ink)" : current ? "var(--soft)" : "transparent", color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flex: "none" }}>{reached ? "✓" : ""}</span>
                <div>
                  <div style={{ fontSize: 18 }}>Level {L.n} · {L.name}</div>
                  {current && <div className="small">Level {L.n}: {whatsLeftFor(L.n, m.plan, d.done)}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="eyebrow" style={{ marginTop: 10 }}>The climb</div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${m.pct}% done`} style={{ width: "100%", height: "auto" }}>
          <line x1={pad} x2={W - pad} y1={y(100)} y2={y(100)} stroke="var(--line-2)" strokeWidth="1.5" />
          <text x={W - pad} y={y(100) - 6} textAnchor="end" fontSize="11" fill="var(--faint)" fontFamily="var(--mono)">100%</text>
          <polyline fill="none" stroke="var(--line-3)" strokeWidth="1.5" strokeDasharray="4 4" points={line.map((p, i) => `${x(i)},${y(p.expected)}`).join(" ")} />
          {actual.length > 0 && <polyline fill="none" stroke="var(--ink)" strokeWidth="2.5" points={actual.map((p, i) => `${x(i)},${y(p.pct!)}`).join(" ")} />}
          {line.length > 1 && <text x={pad} y={H - 6} fontSize="11" fill="var(--faint)" fontFamily="var(--mono)">{shortDate(line[0].week)}</text>}
          {line.length > 1 && <text x={W - pad} y={H - 6} textAnchor="end" fontSize="11" fill="var(--faint)" fontFamily="var(--mono)">{shortDate(line[line.length - 1].week)}</text>}
        </svg>
        <div className="tiny">Solid: your % at the end of each week. Dashed: where the plan expects you to be.</div>

        <div className="eyebrow" style={{ marginTop: 10 }}>Each section</div>
        {bars.map((b) => (
          <div key={b.name} className="row" style={{ gap: 12 }}>
            <span style={{ width: 60 }}>{b.name}</span>
            <div className="bar" style={{ flex: 1, height: 9 }}><div style={{ width: `${Math.round(b.frac * 100)}%`, background: `var(--${b.name === "DI" ? "di" : b.name === "Quant" ? "q" : b.name === "RC" ? "rc" : "cr"})` }} /></div>
          </div>
        ))}
        {rs && <div style={{ fontSize: 18 }}>Reading sets left: {rs.left} of {rs.of}</div>}

        <div className="eyebrow" style={{ marginTop: 10 }}>Official mocks</div>
        <MockDots />

        <div className="eyebrow" style={{ marginTop: 10 }}>Milestones</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {ms.map((x) => (
            <div key={x.id} className="row" style={{ justifyContent: "space-between" }}>
              <span style={{ fontSize: 17, color: x.reached ? "var(--ink)" : "var(--muted)" }}>{x.reached ? "✓ " : ""}{x.name}</span>
              <span className="tiny">{x.reached ? "" : x.progress ?? "waiting"}</span>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}

function MockDots() {
  const { m, d } = useApp();
  const TARGET = d.settings.target;
  const W = 640, H = 70, pad = 20;
  const x = (s: number) => pad + ((W - 2 * pad) * (s - 205)) / 600;
  const dots = m.mocks.filter((r) => r.official && r.total !== null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Official mock scores" style={{ width: "100%", height: "auto" }}>
      <line x1={pad} x2={W - pad} y1={40} y2={40} stroke="var(--line-2)" strokeWidth="1.5" />
      <rect x={x(TARGET - 10)} width={x(Math.min(805, TARGET + 20)) - x(TARGET - 10)} y={28} height={24} fill="var(--mk-t)" />
      <line x1={x(TARGET)} x2={x(TARGET)} y1={22} y2={58} stroke="var(--mk)" strokeWidth="1.5" />
      <text x={x(TARGET)} y={16} textAnchor="middle" fontSize="11" fill="var(--mk-d)" fontFamily="var(--mono)">{TARGET}</text>
      <text x={pad} y={66} fontSize="10" fill="var(--faint)" fontFamily="var(--mono)">205</text>
      <text x={W - pad} y={66} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--mono)">805</text>
      {dots.map((r) => <circle key={r.pieceId} cx={x(r.total!)} cy={40} r={r.practiceRun ? 4 : 7} fill={r.practiceRun ? "var(--rest)" : "var(--mk)"}><title>{r.practiceRun ? "start" : `${r.total}`}</title></circle>)}
      {!dots.length && <text x={W / 2} y={66} textAnchor="middle" fontSize="11" fill="var(--faint)" fontFamily="var(--mono)">The first official mock is in plan week 8.</text>}
    </svg>
  );
}

export function ErrorsScreen() {
  const { m } = useApp();
  const groups = m.adapt.workOn();
  return (
    <Screen>
      <div className="column">
        <Back />
        <div className="title">What to work on</div>
        <div style={{ fontSize: 19 }}>{m.reviews.retired} retired · {m.reviews.inReview} in review{m.reviews.stubborn ? ` · ${m.reviews.stubborn} stubborn` : ""}</div>
        <div className="row wrap"><button className="btn small outline" onClick={() => go("/log")}>Log a question from another source</button></div>
        {!groups.length && <div className="muted" style={{ fontSize: 17 }}>Nothing in review right now.</div>}
        {groups.map((g, i) => (
          <div key={i} className="box" style={{ gap: 4 }}>
            <div style={{ fontSize: 19 }}>{g.heading}</div>
            <div className="small">{g.detail}</div>
            {g.resting && <div className="tiny">Back to this in 10 days ({shortDate(g.resting)}).</div>}
            {g.topic !== "mixed" && <button className="back" style={{ color: "var(--link)" }} onClick={() => go(`/tutor?ctx=${encodeURIComponent(`topic:${g.topic}`)}`)}>Ask the tutor to teach this</button>}
          </div>
        ))}
        <div className="tiny">Headlines are what happened, in your own words where you wrote some.</div>
      </div>
    </Screen>
  );
}
