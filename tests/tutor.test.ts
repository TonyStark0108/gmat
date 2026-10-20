import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { buildModel } from "../src/core/model";
import { studentBrief } from "../src/core/tutor/brief";
import { costOf, overCap } from "../src/core/tutor/cost";
import { SYSTEM, TUTOR_MODEL } from "../src/core/tutor/prompt";
import { starterFor } from "../src/core/tutor/starters";
import { answerIfSeen, runTool } from "../src/core/tutor/tools";
import { allEvents, db, withoutImages } from "../src/data/db";
import { newThread, runTurn, shownMessages } from "../src/data/tutor";
import { fixtureContent, Log, OG_KEY } from "./fixture";
import { sse, textReply, toolReply } from "./sse";

const C = fixtureContent();

/** Saturday's OG block of six, logged: 1 B (wrong), 2 B, 3 C unsure (right), 4 A (wrong), 5 E, 6 A. */
function logged() {
  return new Log().at("2026-11-20T10:00", { type: "setup.done" })
    .at("2026-12-05T10:05", { type: "piece.started", piece: "og1#0", mode: "desk" })
    .grid("2026-12-05T10:10", "og1#0", 1, ["b", "b", "cs", "a", "e", "a"])
    .at("2026-12-05T10:30", { type: "piece.submitted", piece: "og1#0", wrongOrUnsure: 3, answered: 6 })
    .at("2026-12-05T10:30", { type: "piece.done", piece: "og1#0" });
}
const at = (log: Log, when: string) => buildModel(C, log.events, new Date(when));

describe("what the tutor knows", () => {
  it("the brief has your dates, the plan, your accuracy and your misses, and its own notes", () => {
    const log = logged().at("2026-12-06T09:00", { type: "tutor.note", text: "Applying to business school in the next round." });
    const b = studentBrief(at(log, "2026-12-06T10:00"));
    expect(b).toMatch(/Plan start 1 December 2026/);
    expect(b).toMatch(/Saturday 10:00–14:00/);
    expect(b).toMatch(/Quant: 67% over 6 questions/);
    expect(b).toMatch(/\[og1\|1\] Book, page 80, question 1/);
    expect(b).toMatch(/Applying to business school/);
  });

  it("never knows an answer before the blind retry: hidden in review, shown once seen", () => {
    const log = logged();
    const before = at(log, "2026-12-06T10:00").reviews.items.get("og1|1")!;
    expect(answerIfSeen(before).shown).toBe(false);
    expect(runTool(at(log, "2026-12-06T10:00"), "get_question", { item_id: "og1|1" }).result).toMatch(/hidden: their blind retry/);
    expect(studentBrief(at(log, "2026-12-06T10:00"))).not.toMatch(/official/i);
    log.at("2026-12-08T07:50", { type: "review.answer", review: "set:og1", item: "og1|1", attempt: "retry", value: "C" })
      .at("2026-12-08T08:00", { type: "review.done", review: "set:og1" });
    const after = runTool(at(log, "2026-12-08T08:05"), "get_question", { item_id: "og1|1" }).result;
    expect(JSON.parse(after).official_answer).toBe(OG_KEY[0]);
  });

  it("a session started from a review question carries your answers, and the official one only once you've seen it", () => {
    const log = logged();
    expect(starterFor(at(log, "2026-12-06T10:00"), "item:og1|1")!.text).toMatch(/hints please/);
    log.at("2026-12-08T07:50", { type: "review.answer", review: "set:og1", item: "og1|1", attempt: "retry", value: "C" })
      .at("2026-12-08T08:00", { type: "review.done", review: "set:og1" });
    const s = starterFor(at(log, "2026-12-08T08:05"), "item:og1|1")!;
    expect(s.mode).toBe("explain");
    expect(s.text).toMatch(/I answered B; on the retry I put C\. The official answer is A\./);
  });
});

describe("the tutor's tools", () => {
  it("finds official questions you haven't met yet before ones you have, and never the same one twice", () => {
    // the day after: everything was just seen, so nothing comes back yet (the app's own review has it)
    expect(runTool(at(logged(), "2026-12-06T10:00"), "find_official_questions", { qtype: "PS" }).result).toMatch(/No official questions match/);
    // three weeks on: the ones you got right and were sure of are fair practice again; the redos aren't
    const r = JSON.parse(runTool(at(logged(), "2026-12-28T10:00"), "find_official_questions", { qtype: "PS", count: 6 }).result);
    expect(r.map((q: { n: number }) => q.n)).toEqual([2, 5, 6]);
    expect(r[0].status).toBe("seen 5 December 2026, right");
  });

  it("homework is checked before it's offered: real numbers, one question type, at most 15", () => {
    const m = at(logged(), "2026-12-06T10:00");
    expect(runTool(m, "assign_official_questions", { title: "x", book: "og", numbers: [99], reason: "r" }).result).toMatch(/Not in the OG answer key: 99/);
    expect(runTool(m, "assign_official_questions", { title: "x", book: "og", numbers: Array.from({ length: 16 }, (_, i) => i + 1), reason: "r" }).isError).toBe(true);
    const ok = runTool(m, "assign_official_questions", { title: "Percents, again", book: "og", numbers: [1, 3], reason: "Two you found slow." });
    expect(ok.ask).toMatch(/Percents, again: OG 1, 3\. Two you found slow\./);
    expect(ok.events![0].type).toBe("extra.added");
  });

  it("an approved set is in your week, is marked from the key, and gets its own review", () => {
    const log = logged();
    const out = runTool(at(log, "2026-12-07T19:00"), "assign_official_questions", { title: "Percents, again", book: "og", numbers: [1, 3], reason: "r" });
    log.at("2026-12-07T19:01", out.events![0]);
    let m = at(log, "2026-12-08T07:50");
    const p = m.weekExtras.find((x) => x.xkind === "tutor")!;
    expect(p.task.kind).toBe("og_set");
    expect(p.task.pointer.list).toEqual([1, 3]);
    log.at("2026-12-08T07:51", { type: "answer", piece: p.id, q: 1, value: "A", unsure: false, sinceStartMs: 60_000 })
      .at("2026-12-08T07:52", { type: "answer", piece: p.id, q: 3, value: "B", unsure: false, sinceStartMs: 120_000 })
      .at("2026-12-08T07:53", { type: "piece.submitted", piece: p.id, wrongOrUnsure: 1, answered: 2 });
    m = at(log, "2026-12-08T08:00");
    const s = m.reviews.setById.get(`set:${p.taskId}`)!;
    expect(s.all.map((x) => x.q)).toEqual(["1", "3"]);
    expect(s.items.map((x) => x.q)).toEqual(["3"]);
  });

  it("a card and a note go in straight away", () => {
    const m = at(logged(), "2026-12-06T10:00");
    expect(runTool(m, "make_card", { front: "Rates · together", back: "Add the rates, not the times" }).events![0]).toMatchObject({ type: "line", front: "Rates · together" });
    expect(runTool(m, "save_note", { note: "Prefers one worked example, then a try." }).events![0]).toMatchObject({ type: "tutor.note" });
    expect(runTool(m, "make_card", { front: "" }).isError).toBe(true);
  });

  it("the error log filters by section and topic", () => {
    const m = at(logged(), "2026-12-06T10:00");
    const rows = JSON.parse(runTool(m, "get_errors", { topic: "percents" }).result);
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(["og1|1", "og1|3"]);
    expect(runTool(m, "get_errors", { section: "rc" }).result).toMatch(/Nothing in the error log/);
  });
});

describe("cost", () => {
  it("prices a reply at Claude Opus 5.5 rates and stops at the monthly cap", () => {
    expect(costOf({ input_tokens: 1_000_000, output_tokens: 0 }).usd).toBe(4);
    expect(costOf({ input_tokens: 2000, output_tokens: 800, cache_read_input_tokens: 4000 }).usd).toBeCloseTo(0.0248, 4);
    expect(overCap(new Map([["2026-12", 15.2]]), "2026-12-20", 15)).toBe(true);
    expect(overCap(new Map([["2026-11", 99]]), "2026-12-01", 15)).toBe(false);
  });
});

describe("talking to Claude (with a stand-in for the real service)", () => {
  it("sends the right request, streams the reply, asks before adding homework, and records what it did and cost", async () => {
    await db.events.clear();
    const log = logged();
    await db.events.bulkAdd(log.events);
    const bodies: Record<string, unknown>[] = [];
    const headers: Record<string, string>[] = [];
    const replies = [
      toolReply("assign_official_questions", { title: "Percents, again", book: "og", numbers: [1, 3], reason: "Two you found slow." }),
      textReply("Added. Do them on **Tuesday** morning, then we'll look at the review together."),
    ];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      headers.push(Object.fromEntries(new Headers(init.headers).entries()));
      return new Response(sse(replies.shift()!), { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_1" } });
    }) as unknown as typeof fetch;

    let streamed = "";
    const asked: string[] = [];
    const thread = { ...newThread("teach", "Percents"), messages: [{ role: "user", content: [{ type: "text", text: "Help with percents?" }] }] };
    const out = await runTurn({ prefs: { key: "sk-ant-test", cap: 15, effort: "medium" }, model: () => at(log, "2026-12-07T19:00"), thread, fetch: fakeFetch }, {
      onText: (t) => { streamed += t; }, onMessage: () => {}, onTool: () => {},
      approve: async (a) => { asked.push(a); return true; },
    });

    const first = bodies[0];
    expect(first.model).toBe(TUTOR_MODEL);
    expect(first.fallbacks).toBe("default");
    expect(headers[0]["anthropic-beta"]).toMatch(/server-side-fallback-2026-07-01/);
    expect(headers[0]["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect((first.system as { text: string; cache_control?: unknown }[])[0]).toMatchObject({ text: SYSTEM, cache_control: { type: "ephemeral" } });
    expect((first.system as { text: string }[])[2].text).toMatch(/# The student, today/);
    expect((first.tools as { name: string }[]).map((t) => t.name)).toContain("assign_official_questions");
    expect(first.stream).toBe(true);
    // the second request answers the tool and carries the whole turn
    const second = bodies[1].messages as { role: string; content: { type: string; content?: string }[] }[];
    expect(second[second.length - 1].content[0]).toMatchObject({ type: "tool_result", content: expect.stringMatching(/Added to this week/) });
    expect(asked[0]).toMatch(/OG 1, 3/);
    expect(streamed).toMatch(/Do them on \*\*Tuesday\*\* morning/);
    expect(shownMessages(out).map((s) => s.who)).toEqual(["you", "tutor", "did", "tutor"]);
    const evs = await allEvents();
    expect(evs.filter((e) => e.type === "extra.added")).toHaveLength(1);
    expect(evs.filter((e) => e.type === "tutor.usage")).toHaveLength(2);
  });

  it("saying no to homework adds nothing, and tells the tutor", async () => {
    await db.events.clear();
    const log = logged();
    const bodies: Record<string, unknown>[] = [];
    const replies = [toolReply("assign_official_questions", { title: "x", book: "og", numbers: [2], reason: "r" }), textReply("No problem.")];
    const fakeFetch = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response(sse(replies.shift()!), { headers: { "content-type": "text/event-stream" } }); }) as unknown as typeof fetch;
    const thread = { ...newThread("free", "x"), messages: [{ role: "user", content: "hi" }] };
    await runTurn({ prefs: { key: "sk-ant-test", cap: 15, effort: "medium" }, model: () => at(log, "2026-12-07T19:00"), thread, fetch: fakeFetch },
      { onText: () => {}, onMessage: () => {}, onTool: () => {}, approve: async () => false });
    expect((await allEvents()).some((e) => e.type === "extra.added")).toBe(false);
    const last = (bodies[1].messages as { content: { content?: string }[] }[]).pop()!;
    expect(last.content[0].content).toMatch(/said not now/);
  });

  it("a backup keeps the words of a session and leaves the photos on the laptop", () => {
    const t = { ...newThread("explain", "q"), messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } }, { type: "text", text: "this one" }] }] };
    const s = JSON.stringify(withoutImages(t));
    expect(s).not.toMatch(/AAAA/);
    expect(s).toMatch(/this one/);
  });
});
