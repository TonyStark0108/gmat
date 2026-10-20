// Tasks that happen on another site: articles, GMAT Club lists (required sets, extra practice,
// top-ups), the DI stand-ins, timed sections, purchases. The app says exactly what to do there and
// records the result (spec: G2; Extra practice; Top-ups; Sending a question to the app).

import { useEffect, useMemo, useRef, useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import type { Section } from "../../core/content";
import { otherList } from "../../core/links";
import type { Piece } from "../../core/pieces";
import { listTopic } from "../../core/topics";
import { record } from "../../data/db";
import { Back, Screen } from "../bits";
import { SUBJECT, pointerOf, titleOf, whereOf } from "../copy";
import { useFocus } from "../focus";
import { LinkOut } from "../LinkOut";
import { BookGrid } from "./Grid";
import type { Logged } from "./TaskRunner";

export function Outside({ piece, onDone }: { piece: Piece; onDone: (l: Logged | null) => void }) {
  const { content, bus, d, m } = useApp();
  const focus = useFocus();
  const t = piece.task, ptr = t.pointer;
  const k = SUBJECT[piece.section];
  const [counts, setCounts] = useState({ right: 0, wrong: 0, unsure: 0 });
  const [gridDone, setGridDone] = useState(false);
  const refresher = ptr.refresher as { type: "video"; youtubeId: string; url: string; title: string } | { type: "cards"; topic: string } | undefined;
  const [refreshed, setRefreshed] = useState(!refresher || d.seen.has(`refresher:${piece.id}`));

  // Time away on the other site counts, within limits: 6 min a CR question, an hour for a list.
  const cap = t.kind === "cr_set" ? (ptr.count ?? 25) * 6 : 60;
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
    const out: { label: string; url: string }[] = [];
    if (Array.isArray(ptr.links)) out.push(...(ptr.links as { label: string; url: string }[]));
    else if (ptr.lists) {
      const order = t.plan_week <= 2 ? ["easy", "mixed", "medium"] : ["mixed", "medium", "easy"];
      const ks = Object.keys(ptr.lists).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      out.push(...ks.map((key) => ({ label: key === "easy" ? "Easier list" : key === "older_og" ? "Older OG questions" : key === "lsat" ? "LSAT questions" : key === "medium" ? "Medium list" : "Mixed difficulty", url: ptr.lists![key] })));
    } else if (ptr.lists_pool) out.push(...ptr.lists_pool.map((l) => ({ label: `${l.topic ?? "mixed"} (${l.qtype === "GT" ? "graphs & tables" : l.qtype})`, url: l.url })));
    else if (ptr.recipe) out.push(...ptr.recipe.filter((r) => r.url).map((r) => ({ label: r.source, url: r.url! })));
    else if (ptr.sections_from) {
      for (const [sec, ls] of Object.entries(ptr.sections_from as Record<string, { topic: string | null; url: string }[]>)) {
        out.push(...ls.slice(0, 3).map((l) => ({ label: `${sec === "di" ? "DI" : sec}: ${l.topic ?? "mixed"}`, url: l.url })));
      }
    } else if (ptr.url) out.push({ label: t.kind === "admin" ? "Open the page" : "Open it", url: ptr.url });
    return out.filter((l) => !d.deadLinks.has(l.url));
  }, [content, t, ptr, d.deadLinks]);

  const printedTPA = t.kind === "di_set" ? ptr.recipe?.find((r) => r.numbers) : undefined;
  const isQuestions = ["cr_set", "gmatclub_set", "di_set"].includes(t.kind) || t.kind === "mock";
  const timed = !!t.timed || t.kind === "mock";

  async function finish(adminAnswer?: "done" | "not now") {
    if (adminAnswer) await record({ type: "admin", piece: piece.id, answer: adminAnswer });
    if (isQuestions) await record({ type: "outside", piece: piece.id, ...counts });
    const minutes = Math.min(cap, Math.round(awayMin.current));
    if (minutes > 0) await record({ type: "time", minutes, where: bus ? "bus" : "desk", piece: piece.id, source: t.kind });
    // "Not now" never blocks anything: the plan moves on and the card comes back in a week
    await record({ type: "piece.done", piece: piece.id });
    focus.boundary(0, true);
    const total = counts.right + counts.wrong + counts.unsure;
    let note: string | undefined;
    let offer: Logged["offer"];
    const spec = (piece as { spec?: { kind: string; topic: string | null } }).spec;
    if (spec?.kind === "topup" && spec.topic && total) {
      const acc = counts.right / total;
      if (acc >= 0.7) note = "Back on track.";
      // still under 60%: one more, refresher first; after two with no change it rests for 10 days
      else if (acc < 0.6 && m.adapt.history(m.weekStart).count(spec.topic) < 2) {
        offer = { id: `topup:again:${piece.id}`, topic: spec.topic, section: piece.section, wrong: counts.wrong + counts.unsure, total, cause: "concept", line: "" };
      } else if (acc < 0.6) note = "This one rests for now. It's at the top of What to work on, back in 10 days.";
    }
    onDone(isQuestions ? { toLookAgain: counts.wrong + counts.unsure, note, offer } : null);
  }

  const counter = (key: keyof typeof counts, label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="row" style={{ gap: 10 }}>
        <button className="letter" aria-label={`fewer ${label}`} onClick={() => setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] - 1) }))}>−</button>
        <span className="mono" style={{ width: 30, textAlign: "center", fontWeight: 700 }}>{counts[key]}</span>
        <button className="letter" aria-label={`more ${label}`} onClick={() => setCounts((c) => ({ ...c, [key]: c[key] + 1 }))}>+</button>
      </div>
    </div>
  );

  const how = t.kind === "gmatclub_set" || t.kind === "di_set"
    ? timed ? `A timed section: ${ptr.count ?? piece.count ?? 21} questions, 45 minutes, in one go. Noteboard, not paper.`
      : `Work down the list: ${ptr.count ?? piece.count ?? 10} you haven't done.${ptr.how ? " " + String(ptr.how) : ""} For each wrong one, click Send to GMAT app in your bookmarks bar.`
    : t.kind === "mock" ? "Three timed sections, 45 minutes each, with the real test's breaks. Answer every question; blanks cost more than guesses." : "";
  const table = (ptr.types as string[] | undefined)?.includes("TA");

  if (refresher && !refreshed) {
    return (
      <Screen><div className="column" style={{ gap: 12 }}>
        <Back label="← Today · pause" />
        <div className="eyebrow" style={{ color: k.d }}>{k.name} · top-up</div>
        <div style={{ fontSize: 25 }}>First, a short refresher.</div>
        {refresher.type === "video"
          ? <LinkOut url={refresher.url} label={refresher.title || "The plan's video on it"} color={{ c: k.c, d: k.d }} />
          : <button className="btn outline small" onClick={() => go(`/cards?topic=${encodeURIComponent(refresher.topic)}`)}>Your cards on it</button>}
        <div className="spacer" />
        <button className="btn" style={{ background: k.c, borderColor: k.c }} onClick={async () => { await record({ type: "seen", what: `refresher:${piece.id}` }); setRefreshed(true); }}>Done: now the questions</button>
      </div></Screen>
    );
  }

  return (
    <Screen>
      <div className="column" style={{ gap: 12 }}>
        <Back label="← Today · pause" />
        <div className="eyebrow" style={{ color: k.d }}>{k.name} · {whereOf(piece)}</div>
        <div style={{ fontSize: 25, lineHeight: 1.15 }}>{titleOf(piece)}</div>
        {pointerOf(piece, content) && <div className="ptr" style={{ background: k.t }}>{pointerOf(piece, content)}</div>}
        {how && <div className="muted" style={{ fontSize: 16, lineHeight: 1.4 }}>{how}</div>}
        {table && <div className="small">Table questions: find the column the question is about before reading any rows.</div>}

        {printedTPA?.numbers && !gridDone && (
          <div className="box">
            <div style={{ fontSize: 18 }}>First, the printed two-part questions: {printedTPA.source}, {printedTPA.numbers[0]}–{printedTPA.numbers[1]}.</div>
            <BookGrid piece={piece} numbers={printedTPA.numbers} bookId={printedTPA.source.startsWith("DI Review") ? "dir" : "og"} embedded onSubmitted={() => setGridDone(true)} />
          </div>
        )}

        {links.length > 0 && (
          <div className="row wrap" style={{ gap: 8 }}>
            {links.map((l, i) => (
              <LinkOut key={i} url={l.url} label={l.label} color={{ c: k.c, d: k.d }}
                fallback={() => {
                  if (/youtu/.test(l.url) || t.kind === "article" || t.kind === "test_prep" || t.kind === "admin") return { label: "Mark it done and move on", run: () => void finish() };
                  const other = content ? otherList(content, t, l.url, d) : null;
                  return other ? { label: "Open the other list", run: () => window.open(other, "_blank", "noopener") } : null;
                }} />
            ))}
          </div>
        )}

        {isQuestions && (
          <div className="box">
            <div className="small">When you're back</div>
            {counter("right", "Right")}{counter("wrong", "Wrong")}{counter("unsure", "Not sure")}
            {(t.kind === "gmatclub_set" || t.kind === "di_set") && <PasteShare piece={piece} />}
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
            onClick={() => void finish()}>{isQuestions ? "Save it" : "Done"}</button>
        )}
      </div>
    </Screen>
  );
}

/** If the office browser won't allow the bookmark, paste the question's link here instead. */
function PasteShare({ piece }: { piece: Piece }) {
  const [v, setV] = useState("");
  const [said, setSaid] = useState("");
  const save = async () => {
    const url = v.trim();
    if (!/^https?:\/\/(www\.)?gmatclub\.com\//i.test(url)) { setSaid("That isn't a GMAT Club link."); return; }
    const topic = piece.task.topic ? listTopic(piece.task.topic) : null;
    await record({ type: "shared", url, set: piece.taskId, topic, section: piece.section as Section });
    setV("");
    setSaid("Saved. It'll come back in a day or two.");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="tiny">Bookmark blocked? Paste a wrong one's link:</div>
      <div className="row">
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="https://gmatclub.com/forum/…" onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          style={{ flex: 1, height: 42, border: "1.5px solid var(--line-2)", borderRadius: 9, padding: "0 10px", font: "400 12px var(--mono)" }} />
        <button className="btn small outline" onClick={() => void save()}>Save</button>
      </div>
      {said && <div className="small">{said}</div>}
    </div>
  );
}
