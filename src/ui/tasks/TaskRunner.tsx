import { useState } from "react";
import { go } from "../../app/router";
import { useApp } from "../../app/store";
import { DAY_NAMES, addDays, nextDeskSlot, parseYmd, ymd } from "../../core/calendar";
import { now } from "../../core/clock";
import type { BookId } from "../../core/content";
import type { Piece } from "../../core/pieces";
import { submitLine, whyLink } from "../../core/results";
import { record } from "../../data/db";
import type { TopupOffer as TopupOfferT } from "../../core/adapt";
import { TopupOffer } from "../review/SetReview";
import { Back, Screen, openOut, useKeys } from "../bits";
import { CardSession } from "../Cards";
import { words } from "../copy";
import { BookCheck, needsBookCheck, needsCheckMode } from "./BookCheck";
import { CrSet } from "./CrSet";
import { BookGrid } from "./Grid";
import { Drill } from "./Drill";
import { MockTask } from "./Mock";
import { Outside } from "./Outside";
import { RcReader } from "./RcReader";
import { Video } from "./Video";

export interface Logged { toLookAgain: number; firstHalf?: boolean; note?: string; offer?: TopupOfferT }

export function TaskRunner({ pieceId }: { pieceId: string }) {
  const { byId, d } = useApp();
  const [logged, setLogged] = useState<Logged | null>(null);
  const [checked, setChecked] = useState(false);
  const p = byId.get(pieceId);
  if (!p) {
    return <Screen><Back /><div className="t">That task isn't in this plan.</div></Screen>;
  }
  if (logged) return <LoggedScreen piece={p} logged={logged} />;
  const done = (l: Logged | null) => (l ? setLogged(l) : go("/"));
  const t = p.task;
  switch (t.kind) {
    case "og_set": {
      const book = (t.pointer.book ?? "og") as BookId;
      if (!checked && !d.answers.get(p.id)?.size && needsBookCheck(d, book, t.pointer.qtype ?? "PS")) {
        return <BookCheck book={book} qtype={t.pointer.qtype ?? "PS"} first={p.numbers?.[0] ?? 1} onDone={() => setChecked(true)} />;
      }
      return <BookGrid piece={p} onDone={done} />;
    }
    case "rc_section": return <RcReader piece={p} onDone={done} />;
    case "drill": return <Drill piece={p} onDone={done} />;
    case "video": return <Video piece={p} onDone={done} />;
    case "test_prep": return t.pointer.youtube_id ? <Video piece={p} onDone={done} /> : <Outside piece={p} onDone={done} />;
    case "cr_set": return <CrSet piece={p} onDone={done} />;
    case "cards": return <CardSession piece={p.id} topic={t.pointer.topic as string | undefined} />;
    case "mock": return t.pointer.type === "official_mock" ? <MockTask piece={p} onDone={done} /> : <Outside piece={p} onDone={done} />;
    default: return <Outside piece={p} onDone={done} />;
  }
}

/** On submit, the same day: a count, the week's benchmark line, and never the letters (spec: After a set). */
function LoggedScreen({ piece, logged }: { piece: Piece; logged: Logged }) {
  const { d, m, content } = useApp();
  useKeys({ Enter: () => go("/") });
  const set = m.reviews.setById.get(`set:${piece.taskId}`);
  let when = "";
  if (!logged.firstHalf && logged.toLookAgain > 0) {
    if (piece.group === "Q") {
      const slot = nextDeskSlot(now(), d.settings, 3) ?? nextDeskSlot(now(), d.settings, 14);
      when = slot ? `, back on ${DAY_NAMES[parseYmd(slot.day).getDay()]}` : "";
    } else {
      let t = addDays(now(), 1);
      while (t.getDay() === 0 || t.getDay() === 6) t = addDays(t, 1);
      when = `, back on ${DAY_NAMES[parseYmd(ymd(t)).getDay()]}`;
    }
  }
  const n = logged.toLookAgain;
  const bench = !logged.firstHalf && set && content ? submitLine(content, piece.task, set.all) : null;
  const why = content ? whyLink(content, piece.task.benchmark_week || piece.planWeek, piece.section) : null;
  // check mode, for a section's first two book sets: question numbers, never letters
  const book = (piece.task.pointer.book ?? "og") as BookId;
  const qtype = piece.task.pointer.qtype ?? "PS";
  const checkMode = !logged.firstHalf && piece.task.kind === "og_set" && set && needsCheckMode(d, book, qtype);
  const wrongNums = set?.all.filter((it) => it.firstMark === "wrong").map((it) => it.n) ?? [];
  const [answered, setAnswered] = useState(false);
  const careless = m.adapt.carelessLeads && piece.group === "Q";
  return (
    <Screen>
      <div className="column">
        <div className="eyebrow">Logged</div>
        <div className="title">
          {logged.firstHalf ? "First half done. The rest comes up next."
            : n === 0 ? "Logged. Nothing to look at again."
            : `Logged. ${words(n)} to look at again${when}.`}
        </div>
        {bench && <div style={{ fontSize: 19, lineHeight: 1.35 }}>{bench}{why && <button className="back" style={{ marginLeft: 8, color: "var(--link)" }} onClick={() => openOut(why)}>Why?</button>}</div>}
        {logged.note && <div className="muted" style={{ fontSize: 18 }}>{logged.note}</div>}
        {logged.offer && <TopupOffer offer={logged.offer} />}
        {careless && !logged.firstHalf && <div className="small">Check units and what's being asked.</div>}
        {checkMode && !answered && (
          <div className="note">
            <div style={{ fontSize: 18 }}>{wrongNums.length ? `Marked wrong: ${wrongNums.join(", ")}. Does your book's key agree?` : "Nothing marked wrong. Does your book's key agree?"}</div>
            <div className="row">
              <button className="btn small" style={{ flex: 1 }} onClick={async () => { await record({ type: "book.check", scope: `${book}:${qtype}`, what: "checkmode", ok: true }); setAnswered(true); }}>Yes</button>
              <button className="btn ghost small" onClick={async () => { await record({ type: "book.check", scope: `${book}:${qtype}`, what: "checkmode", ok: false }); setAnswered(true); }}>No</button>
            </div>
          </div>
        )}
        {answered && <div className="small">Thanks. {d.bookChecks.filter((c) => c.what === "checkmode").pop()?.ok ? "" : "The next set from this section starts with a quick spot check."}</div>}
        <div className="spacer" />
        <button className="btn" autoFocus onClick={() => go("/")}>Back to today</button>
      </div>
    </Screen>
  );
}
