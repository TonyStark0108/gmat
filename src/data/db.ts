// Everything lives in the laptop's browser (IndexedDB via Dexie). No server, no account, no sync.
// Every answer is written the moment it's entered, one event at a time, never batched.

import Dexie, { type Table } from "dexie";
import { studyDay } from "../core/calendar";
import { now } from "../core/clock";
import { isContent, type Content } from "../core/content";
import type { AppEvent, EventBody } from "../core/events";

interface KV { key: string; value: unknown }
/** A tutor session: the conversation exactly as sent to Claude (so thinking and tool turns replay unchanged). */
export interface TutorThread { id: string; title: string; mode: string; created: number; updated: number; messages: unknown[]; draft?: string; draftContext?: string }
interface ContentRow { key: string; value: Content }

class GmatDB extends Dexie {
  events!: Table<AppEvent, string>;
  kv!: Table<KV, string>;
  content!: Table<ContentRow, string>;
  threads!: Table<TutorThread, string>;
  constructor(name = "gmat") {
    super(name);
    this.version(1).stores({ events: "id, ts, type, day", kv: "key", content: "key" });
    this.version(2).stores({ events: "id, ts, type, day", kv: "key", content: "key", threads: "id, updated" });
  }
}

export const db = new GmatDB();

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Events are read back in timestamp order, so two records in the same millisecond must not tie.
let lastTs = 0;

export async function record(body: EventBody): Promise<AppEvent> {
  const t = now();
  const ts = Math.max(t.getTime(), lastTs + 1);
  lastTs = ts;
  const e = { ...body, id: uuid(), ts, day: studyDay(new Date(ts)) } as AppEvent;
  await db.events.add(e);
  return e;
}

export async function allEvents(): Promise<AppEvent[]> {
  return db.events.orderBy("ts").toArray();
}

// ---------------------------------------------------------------- content
export async function storedContent(): Promise<Content | null> {
  return (await db.content.get("bundle"))?.value ?? null;
}

export async function saveContent(json: unknown): Promise<Content> {
  if (!isContent(json)) throw new Error("That file isn't the GMAT content file.");
  await db.content.put({ key: "bundle", value: json });
  return json;
}

/** Development builds pick up the importer's output without the file picker. */
export async function devContent(): Promise<Content | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const r = await fetch("/dev-content.json");
    return r.ok ? saveContent(await r.json()) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- key/value (device-only things)
export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}
export async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value });
}

// ---------------------------------------------------------------- backup
export interface Backup { format: "gmat-backup"; version: 1; exportedAt: string; contentVersion: string | null; events: AppEvent[]; tutor?: TutorThread[] }

/** Photos stay on the laptop: a backup keeps the words of a tutor session, not the pictures. */
export function withoutImages(t: TutorThread): TutorThread {
  const strip = (c: unknown): unknown => {
    if (Array.isArray(c)) return c.map(strip);
    if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      if (o.type === "image") return { type: "text", text: "[a photo, kept on the laptop it was taken on]" };
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, strip(v)]));
    }
    return c;
  };
  return { ...t, messages: strip(t.messages) as unknown[] };
}

export async function makeBackup(): Promise<Backup> {
  const c = await storedContent();
  const tutor = (await db.threads.toArray()).map(withoutImages);
  return { format: "gmat-backup", version: 1, exportedAt: now().toISOString(), contentVersion: c?.version ?? null, events: await allEvents(), tutor };
}

/** Adds every event the backup has and this device doesn't. Nothing here is ever overwritten. */
export async function restoreBackup(b: unknown): Promise<{ added: number; total: number }> {
  const bk = b as Backup;
  if (!bk || bk.format !== "gmat-backup" || !Array.isArray(bk.events)) throw new Error("That file isn't a GMAT backup.");
  const have = new Set(await db.events.toCollection().primaryKeys());
  const fresh = bk.events.filter((e) => !have.has(e.id));
  await db.events.bulkAdd(fresh);
  // tutor sessions: keep whichever copy of a session is newer
  for (const t of bk.tutor ?? []) {
    const mine = await db.threads.get(t.id);
    if (!mine || mine.updated < t.updated) await db.threads.put(t);
  }
  if (fresh.length) await record({ type: "restored", added: fresh.length });
  return { added: fresh.length, total: bk.events.length };
}

export async function persistStorage(): Promise<{ persisted: boolean; supported: boolean }> {
  if (!navigator.storage?.persist) return { persisted: false, supported: false };
  const already = await navigator.storage.persisted();
  return { persisted: already || (await navigator.storage.persist()), supported: true };
}
