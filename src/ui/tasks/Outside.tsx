// Tasks that happen on another site: articles, GMAT Club lists, CR sets, mba.com, purchases.
// The app says exactly what to do there and records the result (spec: G2).
// Phase 1 keeps these simple; the CR letter grid, counters' redo links and mock review come in Phase 2.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../app/store";
import type { Piece } from "../../core/pieces";
import { record } from "../../data/db";
import { Back, Screen, openOut } from "../bits";
import { SUBJECT, pointerOf, titleOf, whereOf } from "../copy";
import { useFocus } from "../focus";
import { BookGrid } from "./Grid";
import type { Logged } from "./TaskRunner";

const MBA_URL = "https://www.mba.com/";   // catalogue L153

export function Outside({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { content, bus } = useApp();
  const focus = useFocus();
  const t = piece.task, ptr = t.pointer;
  const k = SUBJECT[piece.section];
  const [counts, setCounts] = useState({ right: 0, wrong: 0, unsure: 0 });
  const [scores, setScores] = useState({ total: "", quant: "", verbal: "", di: "" });
  const [gridDone, setGridDone] = useState(false);

  // Time away on the other site counts, within limits: 6 min a CR question, an hour for a list.
  const cap = t.kind === "cr_set" ? (ptr.count ?? 25) * 6 : t.kind === "mock" ? 0 : 60;
  const leftAt = useRef<number | null>(null);
  const awayMin = useRef(0);
  useEffect(() => {
    const on = () => {
      if (document.hidden) { if (leftAt.current === null) leftAt.current = Date.now(); }
      else if (leftAt.current !== null) { awayMin.current += (Date.now() - leftAt.current) / 60_000; leftAt.current = null; }
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const links = useMemo(() => {
    if (t.kind === "cr_set") {
      const set = content?.cr_bank.default_sets.find((s) => s.id === ptr.set);
      return (set?.questions ?? []).map((q) => ({ label: `Question ${q.n}`, url: q.url }));
    }
    if (ptr.lists) {
      const order = t.plan_week <= 2 ? ["easy", "mixed", "medium"] : ["mixed", "medium", "easy"];
      const ks = Object.keys(ptr.lists).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return ks.map((key) => ({ label: key === "easy" ? "Easier list" : key === "older_og" ? "Older OG questions" : key === "lsat" ? "LSAT questions" : "Mixed difficulty", url: ptr.lists![key] }));
    }
    if (ptr.lists_pool) return ptr.lists_pool.map((l) => ({ label: `${l.topic ?? "mixed"} (${l.qtype === "GT" ? "graphs & tables" : l.qtype})`, url: l.url }));
    if (ptr.recipe) return ptr.recipe.filter((r) => r.url).map((r) => ({ label: r.source, url: r.url! }));
    if (t.kind === "mock" && ptr.type === "official_mock") return [{ label: "Open mba.com", url: MBA_URL }];
    if (ptr.url) return [{ label: t.kind === "admin" ? "Open the page" : "Open it", url: ptr.url }];
    return [];
  }, [content, t, ptr]);

  const printedTPA = t.kind === "di_set" ? ptr.recipe?.find((r) => r.numbers) : undefined;
  const isQuestions = ["cr_set", "gmatclub_set", "di_set"].includes(t.kind) || (t.kind === "mock" && ptr.type !== "official_mock");
  const isOfficialMock = t.kind === "mock" && ptr.type === "official_mock";

  async function finish(adminAnswer?: "done" | "not now") {
    if (adminAnswer) await record({ type: "admin", piece: piece.id, answer: adminAnswer });
    if (adminAnswer === "not now") { onDone(null); return; }
    if (isQuestions) await record({ type: "outside", piece: piece.id, ...counts });
    if (isOfficialMock) {
      const n = (s: string) => (s ? Number(s) : undefined);
      await record({ type: "outside", piece: piece.id, scores: Object.fromEntries(Object.entries(scores).filter(([, v]) => v).map(([kk, v]) => [kk, n(v)!])) });
    }
    const minutes = isOfficialMock ? 135 : Math.min(cap, Math.round(awayMin.current));
    if (minutes > 0) await record({ type: "time", minutes, where: bus ? "bus" : "desk", piece: piece.id, source: t.kind });
    await record({ type: "piece.done", piece: piece.id });
    focus.boundary(0, true);
    onDone(isQuestions ? { toLookAgain: counts.wrong + counts.unsure } : null);
  }

  const counter = (key: keyof typeof counts, label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="row" style={{ gap: 10 }}>
        <button className="letter" onClick={() => setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] - 1) }))}>−</button>
        <span className="mono" style={{ width: 30, textAlign: "center", fontWeight: 700 }}>{counts[key]}</span>
        <button className="letter" onClick={() => setCounts((c) => ({ ...c, [key]: c[key] + 1 }))}>+</button>
      </div>
    </div>
  );

  const how = t.kind === "cr_set"
    ? "All in one go, under an hour. Open each question, answer it on GMAT Club, jot your letter in your notebook (a ? if unsure), come back, open the next."
    : t.kind === "gmatclub_set" || t.kind === "di_set"
      ? `Work down the list: ${ptr.count ?? piece.count ?? 10} you haven't done.${ptr.how ? " " + String(ptr.how) : ""}`
      : t.kind === "mock" && isOfficialMock ? "Answer every question; blanks cost more than guesses. Noteboard, not paper."
        : t.kind === "mock" ? "Three timed sections, 45 minutes each, with the real test's breaks." : "";

  return (
    <Screen>
      <div className="column" style={{ gap: 12 }}>
        <Back label="← Today · pause" />
        <div className="eyebrow" style={{ color: k.d }}>{k.name} · {whereOf(piece)}</div>
        <div style={{ fontSize: 25, lineHeight: 1.15 }}>{titleOf(piece)}</div>
        {pointerOf(piece, content) && <div className="ptr" style={{ background: k.t }}>{pointerOf(piece, content)}</div>}
        {t.kind === "admin" && typeof (t as { detail?: string }).detail === "string" && <div className="muted" style={{ fontSize: 17 }}>{(t as { detail?: string }).detail}</div>}
        {how && <div className="muted" style={{ fontSize: 16, lineHeight: 1.4 }}>{how}</div>}

        {printedTPA?.numbers && !gridDone && (
          <div className="box">
            <div style={{ fontSize: 18 }}>First, the printed two-part questions: {printedTPA.source}, {printedTPA.numbers[0]}–{printedTPA.numbers[1]}.</div>
            <BookGrid piece={piece} numbers={printedTPA.numbers} bookId={printedTPA.source.startsWith("DI Review") ? "dir" : "og"} embedded onSubmitted={() => setGridDone(true)} />
          </div>
        )}

        {links.length > 0 && (
          <div className="row wrap" style={{ gap: 8 }}>
            {links.map((l, i) => (
              <button key={i} className="btn outline small" style={{ fontSize: 15, height: 48, borderColor: k.c, color: k.d }} onClick={() => openOut(l.url)}>{l.label} ↗</button>
            ))}
          </div>
        )}

        {isQuestions && (
          <div className="box">
            <div className="small">When you're back</div>
            {counter("right", "Right")}{counter("wrong", "Wrong")}{counter("unsure", "Not sure")}
          </div>
        )}
        {isOfficialMock && (
          <div className="box">
            <div className="small">When you're back: your scores</div>
            {(["total", "quant", "verbal", "di"] as const).map((key) => (
              <div className="field" key={key}><span>{key === "di" ? "Data Insights" : key[0].toUpperCase() + key.slice(1)}</span>
                <input inputMode="numeric" value={scores[key]} onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value.replace(/\D/g, "") }))} style={{ width: 80 }} /></div>
            ))}
          </div>
        )}

        <div className="spacer" />
        {t.kind === "admin" ? (
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={() => void finish("done")}>Done</button>
            <button className="btn ghost" onClick={() => void finish("not now")}>Not now</button>
          </div>
        ) : (
          <button className="btn" style={{ background: k.c, borderColor: k.c }} disabled={!!printedTPA?.numbers && !gridDone}
            onClick={() => void finish()}>{isQuestions || isOfficialMock ? "Save it" : "Done"}</button>
        )}
      </div>
    </Screen>
  );
}
