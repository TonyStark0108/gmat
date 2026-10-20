// Talking to Claude for the tutor. The key is yours, kept only in this browser (never in a backup or
// the code). Each turn: the standing instructions (cached), the session's opener, a fresh brief of
// your data, the conversation, and the tools. Replies stream in. A tool that adds work to your week
// waits for your OK; everything else runs straight away and is recorded like any other event.

import Anthropic from "@anthropic-ai/sdk";
import type { Model } from "../core/model";
import { studentBrief } from "../core/tutor/brief";
import { costOf } from "../core/tutor/cost";
import { SYSTEM, TUTOR_MODEL, opener, type TutorMode } from "../core/tutor/prompt";
import { NEEDS_OK, TOOLS, runTool } from "../core/tutor/tools";
import { CONTEXT_MARK } from "../core/tutor/starters";
import { db, record, type TutorThread } from "./db";

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlock;

import { type TutorPrefs } from "./tutorPrefs";
export { type TutorPrefs, tutorPrefs, saveTutorKey, saveTutorCap, saveTutorEffort } from "./tutorPrefs";

export function newThread(mode: TutorMode, title: string): TutorThread {
  const t = Date.now();
  return { id: `t${t.toString(36)}${Math.random().toString(36).slice(2, 6)}`, title, mode, created: t, updated: t, messages: [] };
}

export const saveThread = (t: TutorThread) => db.threads.put({ ...t, updated: Date.now() });

export interface TurnHooks {
  onText: (delta: string) => void;
  onMessage: (thread: TutorThread) => void;          // after each assistant message or tool result
  approve: (ask: string) => Promise<boolean>;
  onTool: (name: string, summary: string) => void;
}

export class TutorError extends Error {
  constructor(message: string, public kind: "key" | "busy" | "offline" | "refusal" | "other") { super(message); }
}

const toolsForApi = TOOLS.map((t) => ({ ...t, eager_input_streaming: true })) as unknown as Anthropic.Beta.BetaToolUnion[];

/** Marks the end of the conversation for caching, so the tool loop within a turn re-reads it cheaply. */
function withCacheMark(messages: Msg[]): Msg[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  const content = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : [...last.content];
  const i = content.length - 1;
  content[i] = { ...(content[i] as object), cache_control: { type: "ephemeral" } } as (typeof content)[number];
  return [...messages.slice(0, -1), { ...last, content }];
}

const TOOL_WORDS: Record<string, string> = {
  get_errors: "Looked at your error log", get_topic_stats: "Looked at your topic accuracy", get_question: "Looked up the question",
  find_official_questions: "Looked for official questions", get_week: "Looked at this week", make_card: "Saved a card",
  save_note: "Noted for next time", assign_official_questions: "Homework", assign_gmatclub_list: "Homework",
};

/**
 * One turn: send the conversation, stream the reply, run any tools, and keep going until the tutor
 * has answered (at most 8 rounds of tools). Returns the thread with every message appended.
 */
export async function runTurn(args: { prefs: TutorPrefs; model: () => Model; thread: TutorThread; signal?: AbortSignal; fetch?: typeof fetch }, hooks: TurnHooks): Promise<TutorThread> {
  const { prefs } = args;
  if (!prefs.key) throw new TutorError("Add your Claude API key in Settings first.", "key");
  const client = new Anthropic({ apiKey: prefs.key, dangerouslyAllowBrowser: true, maxRetries: 2, ...(args.fetch ? { fetch: args.fetch } : {}) });
  let thread = { ...args.thread, messages: [...args.thread.messages] };
  const messages = thread.messages as Msg[];
  const brief = studentBrief(args.model());
  let jsonRetries = 0;

  for (let round = 0; round < 8; round++) {
    let msg: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: TUTOR_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: prefs.effort },
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: opener(thread.mode as TutorMode), cache_control: { type: "ephemeral" } },
          { type: "text", text: `# The student, today\n\n${brief}`, cache_control: { type: "ephemeral" } },
        ],
        tools: toolsForApi,
        messages: withCacheMark(messages),
      }, { signal: args.signal });
      stream.on("text", hooks.onText);
      msg = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new TutorError("That API key didn't work. Check it in Settings.", "key");
      if (err instanceof Anthropic.RateLimitError) throw new TutorError("Claude is busy for a moment. Try again in a minute.", "busy");
      if (err instanceof Anthropic.APIConnectionError) throw new TutorError("No connection to Claude right now. Your message is kept; send it again when there's signal.", "offline");
      if (err instanceof Anthropic.APIUserAbortError) throw new TutorError("Stopped.", "other");
      if (err instanceof Anthropic.APIError) throw new TutorError(`Claude couldn't answer (${err.status}): ${err.message}`, "other");
      // a tool input that couldn't be parsed at all: ask again, a couple of times at most
      if (jsonRetries++ < 2) { round--; continue; }
      throw new TutorError(`Something went wrong: ${(err as Error).message}`, "other");
    }

    const c = costOf(msg.usage);
    await record({ type: "tutor.usage", thread: thread.id, model: msg.model, ...c });
    messages.push({ role: "assistant", content: msg.content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
    thread = { ...thread, messages, updated: Date.now() };
    await saveThread(thread);
    hooks.onMessage(thread);

    if (msg.stop_reason === "refusal") throw new TutorError("The tutor can't help with that one.", "refusal");
    if (msg.stop_reason === "pause_turn") continue;
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length) break;
    if (msg.stop_reason === "max_tokens") break;     // never run a tool on a cut-off input

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = u.input && typeof u.input === "object" && !Array.isArray(u.input) ? (u.input as Record<string, unknown>) : null;
      if (!input) { results.push({ type: "tool_result", tool_use_id: u.id, content: "The input wasn't an object.", is_error: true }); continue; }
      const out = runTool(args.model(), u.name, input);
      let text = out.result;
      if (!out.isError && out.events?.length) {
        const ok = NEEDS_OK.has(u.name) ? await hooks.approve(out.ask ?? out.result) : true;
        if (ok) {
          for (const e of out.events) await record(e);
          hooks.onTool(u.name, NEEDS_OK.has(u.name) ? `Added to this week: ${out.ask ?? ""}` : u.name === "make_card" ? `Saved a card: ${String(input.front ?? "")}` : `Noted: ${String(input.note ?? "")}`);
        } else text = "The student said not now. Don't add it again unless they ask.";
      } else hooks.onTool(u.name, TOOL_WORDS[u.name] ?? u.name);
      results.push({ type: "tool_result", tool_use_id: u.id, content: text, ...(out.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
    thread = { ...thread, messages, updated: Date.now() };
    await saveThread(thread);
    hooks.onMessage(thread);
  }
  return thread;
}

/** A photo, made small enough to send (longest side 1568 px, JPEG), as base64. */
export async function photoToBlock(file: Blob): Promise<Anthropic.Beta.BetaImageBlockParam> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
}

/** The visible pieces of a stored conversation: what you said, what the tutor said, what it did. */
export type Shown = { who: "you"; text: string; images: string[] } | { who: "tutor"; text: string } | { who: "did"; text: string };

export function shownMessages(t: TutorThread): Shown[] {
  const out: Shown[] = [];
  for (const m of t.messages as Msg[]) {
    if (typeof m.content === "string") { out.push(m.role === "user" ? { who: "you", text: m.content, images: [] } : { who: "tutor", text: m.content }); continue; }
    if (m.role === "user") {
      const text = m.content.filter((b) => b.type === "text" && !(b as { text: string }).text.startsWith(CONTEXT_MARK)).map((b) => (b as { text: string }).text).join("\n");
      const images = m.content.filter((b) => b.type === "image").map((b) => { const s = (b as Anthropic.Beta.BetaImageBlockParam).source; return s.type === "base64" ? `data:${s.media_type};base64,${s.data}` : ""; }).filter(Boolean);
      if (text || images.length) out.push({ who: "you", text, images });
      continue;
    }
    for (const b of m.content as unknown as Block[]) {
      if (b.type === "text" && b.text.trim()) out.push({ who: "tutor", text: b.text });
      else if (b.type === "tool_use") out.push({ who: "did", text: TOOL_WORDS[b.name] ?? b.name });
    }
  }
  return out;
}
