// What's covered: every topic the plan teaches, whether you've started it, its cards, and where it
// stands from your own work. Words only, no scores: "Comes up later", "Started", "Building",
// "Consistent", "Confirmed" (two good sets a week apart). Nothing here can be started; it's the list
// that shows nothing has slipped through.

import { useMemo } from "react";
import { go } from "../app/router";
import { useApp } from "../app/store";
import { shortDate } from "../core/calendar";
import { STANDING_WORDS } from "../core/mastery";
import { coverage, type CoverageRow } from "../core/recall";
import { Back, Screen } from "./bits";
import { SUBJECT } from "./copy";

const GROUPS: { title: string; sections: string[] }[] = [
  { title: "Quant", sections: ["quant"] }, { title: "Data Insights", sections: ["di"] }, { title: "Verbal", sections: ["rc", "cr"] },
];

export function CoverageScreen() {
  const { m } = useApp();
  const c = useMemo(() => coverage(m), [m]);
  return (
    <Screen>
      <div className="column" style={{ gap: 14 }}>
        <Back to="/map" label="← The map" />
        <div className="eyebrow">What's covered</div>
        <div className="title">{c.started} of {c.total} topics started</div>
        <div className="small">
          {c.missingCards.length ? `No cards yet for: ${c.missingCards.join(", ")}.` : "Every topic has its cards."} {c.comingBack} {c.comingBack === 1 ? "mistake is" : "mistakes are"} coming back
          {c.look ? `, ${c.look} worth another look` : ""}. {m.sugg.waiting.length ? `${m.sugg.waiting.length} new cards are waiting their turn, a few a day.` : ""}
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="eyebrow" style={{ marginTop: 6 }}>{g.title}</div>
            {c.rows.filter((r) => g.sections.includes(r.section)).map((r) => <Row key={r.topic} r={r} />)}
          </div>
        ))}
        <div className="tiny">Confirmed: two sets of five or more, a week or more apart, both 80% or better on the first try, and no concept or process mistakes on it in the last two weeks. Confirmed topics stop drawing extra practice.</div>
        <button className="btn outline small" style={{ alignSelf: "flex-start" }} onClick={() => go("/cards/manage")}>All your cards</button>
      </div>
    </Screen>
  );
}

function Row({ r }: { r: CoverageRow }) {
  const k = SUBJECT[r.section];
  const confirmed = r.standing === "confirmed";
  return (
    <div className="box" style={{ gap: 4, padding: "10px 14px", opacity: r.standing === "later" ? 0.6 : 1 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
        <span className="row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: k.c }} />
          <span style={{ fontSize: 17 }}>{r.name}</span>
        </span>
        <span className="pill" style={confirmed ? { background: k.c, color: "var(--paper)", borderColor: k.c } : undefined}>{STANDING_WORDS[r.standing]}</span>
      </div>
      <div className="tiny">
        {r.met ? `Started ${shortDate(r.met)}` : r.firstWeek ? `Comes up in plan week ${r.firstWeek}` : "Through extra practice"}
        {` · ${r.kept} of ${r.cards} cards in`}
        {r.inReview ? ` · ${r.inReview} coming back` : ""}
      </div>
    </div>
  );
}
