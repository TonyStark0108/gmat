// Everything lives in the laptop's browser (IndexedDB via Dexie). No server, no account, no sync.
// Every answer is written the moment it's entered, one event at a time, never batched.

import Dexie, { type Table } from "dexie";
import { studyDay } from "../core/calendar";
import { now } from "../core/clock";
import { isContent, type Content } from "../core/content";
import type { AppEvent, EventBody } from "../core/events";

interface KV { key: string; value: unknown }
interface ContentRow { key: string; value: Content }

class GmatDB extends Dexie {
  events!: Table<AppEvent, string>;
  kv!: Table<KV, string>;
  content!: Table<ContentRow, string>;
  constructor(name = "gmat") {
    super(name);
    this.version(1).stores({ events: "id, ts, type, day", kv: "key", content: "key" });
  }
}

export const db = new GmatDB();

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function record(body: EventBody): Promise<AppEvent> {
  const t = now();
  const e = { ...body, id: uuid(), ts: t.getTime(), day: studyDay(t) } as AppEvent;
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
export interface Backup { format: "gmat-backup"; version: 1; exportedAt: string; contentVersion: string | null; events: AppEvent[] }

export async function makeBackup(): Promise<Backup> {
  const c = await storedContent();
  return { format: "gmat-backup", version: 1, exportedAt: now().toISOString(), contentVersion: c?.version ?? null, events: await allEvents() };
}

/** Adds every event the backup has and this device doesn't. Nothing here is ever overwritten. */
export async function restoreBackup(b: unknown): Promise<{ added: number; total: number }> {
  const bk = b as Backup;
  if (!bk || bk.format !== "gmat-backup" || !Array.isArray(bk.events)) throw new Error("That file isn't a GMAT backup.");
  const have = new Set(await db.events.toCollection().primaryKeys());
  const fresh = bk.events.filter((e) => !have.has(e.id));
  await db.events.bulkAdd(fresh);
  return { added: fresh.length, total: bk.events.length };
}

export async function persistStorage(): Promise<{ persisted: boolean; supported: boolean }> {
  if (!navigator.storage?.persist) return { persisted: false, supported: false };
  const already = await navigator.storage.persisted();
  return { persisted: already || (await navigator.storage.persist()), supported: true };
}
