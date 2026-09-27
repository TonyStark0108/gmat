// Weekly backup: one JSON file of the whole history, into a folder picked once (File System
// Access API, Chrome/Edge), keeping the last 8. Falls back to a normal download.

import { ymd } from "../core/calendar";
import { now } from "../core/clock";
import { kvGet, kvSet, makeBackup, record } from "./db";

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  values?: () => AsyncIterable<FileSystemHandle>;
};

export const folderSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function pickFolder(): Promise<DirHandle | null> {
  if (!folderSupported()) return null;
  // @ts-expect-error: not yet in TypeScript's DOM types
  const h: DirHandle = await window.showDirectoryPicker({ id: "gmat-backups", mode: "readwrite" });
  await kvSet("backupFolder", h);
  return h;
}

async function folder(ask: boolean): Promise<DirHandle | null> {
  const h = await kvGet<DirHandle>("backupFolder");
  if (!h) return null;
  const q = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (q === "granted") return h;
  if (ask && (await h.requestPermission?.({ mode: "readwrite" })) === "granted") return h;
  return null;
}

/** Day-one check: can we write into the backup folder? */
export async function testFolderWrite(h: DirHandle): Promise<boolean> {
  try {
    const f = await h.getFileHandle("gmat-write-test.txt", { create: true });
    const w = await f.createWritable();
    await w.write("ok");
    await w.close();
    await h.removeEntry("gmat-write-test.txt");
    return true;
  } catch {
    return false;
  }
}

export async function backupNow(ask = true): Promise<{ where: "folder" | "download"; file: string }> {
  const data = JSON.stringify(await makeBackup());
  const file = `gmat-backup-${ymd(now())}.json`;
  const h = await folder(ask);
  if (h) {
    try {
      const fh = await h.getFileHandle(file, { create: true });
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
      await keepLast(h, 8);
      await record({ type: "backup", where: "folder", file });
      return { where: "folder", file };
    } catch {
      /* fall through to a download */
    }
  }
  download(file, data);
  await record({ type: "backup", where: "download", file });
  return { where: "download", file };
}

async function keepLast(h: DirHandle, n: number) {
  if (!h.values) return;
  const names: string[] = [];
  for await (const e of h.values()) if (e.kind === "file" && /^gmat-backup-\d{4}-\d\d-\d\d\.json$/.test(e.name)) names.push(e.name);
  names.sort();
  for (const old of names.slice(0, Math.max(0, names.length - n))) await h.removeEntry(old);
}

export function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readJsonFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}
