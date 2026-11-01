import { openDB } from "idb";
export interface Note {
  path: string;
  content: string;
  checksum: string;
  sequence: number;
  updated: string;
  deleted: boolean;
}
export interface Pending {
  path: string;
  content: string;
  expected_checksum: string | null;
  operation_id: string;
  deleted: boolean;
  conflict?: string;
}
const db = openDB("quiccie", 2, {
  upgrade(d) {
    if (!d.objectStoreNames.contains("notes"))
      d.createObjectStore("notes", { keyPath: "path" });
    if (!d.objectStoreNames.contains("pending"))
      d.createObjectStore("pending", { keyPath: "path" });
    if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
    if (!d.objectStoreNames.contains("attachments"))
      d.createObjectStore("attachments", { keyPath: "path" });
  },
});
export type SyncPhase = "idle" | "sending" | "receiving" | "synced" | "pending" | "offline" | "error" | "auth" | "conflict" | "storage";
export interface SyncState { phase: SyncPhase; pending: number; conflicts: number; lastSuccess: string | null; local: "saved" | "saving" | "failed"; }
let localGeneration=0;
export let syncState: SyncState = { phase: "idle", pending: 0, conflicts: 0, lastSuccess: null, local: "saved" };
function publish(patch: Partial<SyncState> = {}) {
  syncState = { ...syncState, ...patch };
  window.dispatchEvent(new CustomEvent("quiccie-sync-state", { detail: syncState }));
}
export function localSave(state: SyncState["local"]) { if(state==="saving")localGeneration++; publish({ local: state }); }
export async function refreshSyncState() {
  try {
    const d = await db;
    const pending: Pending[] = await d.getAll("pending");
    const files = (await d.getAll("attachments")).filter(f => f.pending);
    const count = pending.length + files.length;
    const conflicts = pending.filter(p => p.conflict).length;
    let phase = syncState.phase;
    if (!syncing && !["offline", "error", "auth", "storage"].includes(phase))
      phase = conflicts ? "conflict" : count ? "pending" : syncState.lastSuccess ? "synced" : "idle";
    publish({ phase, pending: count, conflicts, lastSuccess: (await d.get("meta", "last-success")) ?? null });
  } catch { publish({ phase: "storage" }); }
}
async function request(input: RequestInfo | URL, options?: RequestInit) {
  try { return await fetch(input, options); }
  catch(e) { throw Object.assign(new Error("Cannot reach the server."), { network: true, cause: e }); }
}
function requireOK(response: Response, message: string) {
  if (!response.ok) throw Object.assign(new Error(message), { status: response.status });
}
export async function api(path: string, options: RequestInit = {}) {
  const r = await request("/api/" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Quiccie-Request": "1",
      ...options.headers,
    },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw Object.assign(new Error(e.error), { status: r.status });
  }
  return r.json();
}
export async function library(): Promise<Note[]> {
  const d = await db;
  const notes: Note[] = await d.getAll("notes");
  const pending: Pending[] = await d.getAll("pending");
  const all = new Map(notes.map((n) => [n.path, n]));
  for (const p of pending)
    all.set(p.path, {
      ...all.get(p.path),
      path: p.path,
      content: p.content,
      checksum: p.expected_checksum ?? "",
      sequence: 0,
      updated: new Date().toISOString(),
      deleted: p.deleted,
    });
  return [...all.values()]
    .filter((n) => !n.deleted)
    .sort((a, b) => a.path.localeCompare(b.path));
}
export async function pendingFor(path: string): Promise<Pending | undefined> {
  return (await db).get("pending", path);
}
export async function edit(
  path: string,
  content: string,
  deleted = false,
  baseChecksum?: string | null,
  baseContent?: string,
) {
  localGeneration++;
  const d = await db;
  const tx = d.transaction(["notes", "pending"], "readwrite");
  const existing: Pending | undefined = await tx
    .objectStore("pending")
    .get(path);
  const base: Note | undefined = await tx.objectStore("notes").get(path);
  const value: Pending = {
    path,
    content,
    deleted,
    expected_checksum: existing
      ? existing.expected_checksum
      : baseChecksum !== undefined
        ? (base && baseContent === base.content ? base.checksum : baseChecksum)
        : (base?.checksum ?? null),
    operation_id: crypto.randomUUID(),
    conflict: existing?.conflict,
  };
  await tx.objectStore("pending").put(value);
  await tx.done;
  window.dispatchEvent(new Event("quiccie-local"));
  await refreshSyncState();
}
let syncing = false;
let syncAgain = false;
export async function sync() {
  if (syncing) {syncAgain=true;return;}
  syncing = true;
  publish({ phase: "sending" });
  try {
    await refreshSyncState();
    const d = await db;
    for (const file of await d.getAll("attachments")) {
      if (!file.pending) continue;
      const response = await request(
        "/api/attachment?path=" + encodeURIComponent(file.path),
        {
          method: "POST",
          headers: { "X-Quiccie-Request": "1" },
          body: file.blob,
        },
      );
      requireOK(response, "The attachment was not saved on the server.");
      const tx = d.transaction("attachments", "readwrite");
      const current = await tx.store.get(file.path);
      if (current?.version === file.version) await tx.store.put({ ...current, pending: false });
      await tx.done;
    }
    const pending: Pending[] = await d.getAll("pending");
    for (const p of pending) {
      if (p.conflict) continue;
      const { conflict, ...freshRequest } = p;
      const request: Pending =
        (await d.get("meta", "inflight:" + p.path)) ?? freshRequest;
      await d.put("meta", request, "inflight:" + p.path);
      try {
        const n: Note = await api("notes", {
          method: "PUT",
          body: JSON.stringify(request),
        });
        const tx = d.transaction(["notes", "pending", "meta"], "readwrite");
        await tx.objectStore("notes").put(n);
        await tx.objectStore("meta").delete("inflight:" + p.path);
        const current: Pending | undefined = await tx
          .objectStore("pending")
          .get(p.path);
        if (current?.operation_id === request.operation_id)
          await tx.objectStore("pending").delete(p.path);
        else if (current) {
          current.expected_checksum = n.checksum;
          await tx.objectStore("pending").put(current);
        }
        await tx.done;
      } catch (e: any) {
        if (e.status === 409) {
          await d.delete("meta", "inflight:" + p.path);
          const current: Pending | undefined = await d.get("pending", p.path);
          if (current) {
            current.conflict =
              "This note changed elsewhere. Your edit is safe here.";
            await d.put("pending", current);
          }
        } else throw e;
      }
    }
    publish({ phase: "receiving" });
    let complete = false;
    let cursor: number = (await d.get("meta", "cursor")) ?? 0;
    for (let page = 0; page < 1000; page++) {
      const result: { changes: Note[]; next: number; more: boolean } =
        await api("changes?after=" + cursor);
      const tx = d.transaction(["notes", "meta"], "readwrite");
      for (const n of result.changes) await tx.objectStore("notes").put(n);
      await tx.objectStore("meta").put(result.next, "cursor");
      await tx.done;
      cursor = result.next;
      if (!result.more) { complete = true; break; }
    }
    if (!complete) throw new Error("The sync page limit was reached. Try again.");
    for (const file of await api("attachments")) {
      if (await d.get("attachments", file.path)) continue;
      const response = await request(
        "/api/attachment?path=" + encodeURIComponent(file.path),
      );
      requireOK(response, "An attachment is not available offline.");
      const blob = await response.blob();
      const tx = d.transaction("attachments", "readwrite");
      if (!(await tx.store.get(file.path))) await tx.store.put({path: file.path, blob, pending: false});
      await tx.done;
    }
    const generation=localGeneration;
    const final=d.transaction(["pending","attachments","meta"],"readwrite");
    const remaining: Pending[] = await final.objectStore("pending").getAll();
    const files=(await final.objectStore("attachments").getAll()).filter(f=>f.pending);
    const count = remaining.length + files.length;
    const conflicts = remaining.filter(p => p.conflict).length;
    let phase: SyncPhase = conflicts ? "conflict" : count ? "pending" : "synced";
    if (!count && generation===localGeneration && syncState.local==='saved') await final.objectStore("meta").put(new Date().toISOString(), "last-success");
    const lastSuccess=(await final.objectStore("meta").get("last-success"))??null;
    await final.done;
    if(generation!==localGeneration && phase==='synced')phase='pending';
    publish({ phase, pending: count, conflicts, lastSuccess });
    const detail = conflicts ? "Conflict: review your edits" : count ? "Edits wait for sync" : "Synced";
    window.dispatchEvent(new CustomEvent("quiccie-sync", { detail }));
  } catch (e: any) {
    const storage = ["QuotaExceededError", "InvalidStateError", "UnknownError", "AbortError"].includes(e.name);
    const phase = e.status === 401 ? "auth" : storage ? "storage" : e.network && !navigator.onLine ? "offline" : "error";
    publish({ phase });
    window.dispatchEvent(new CustomEvent("quiccie-sync", { detail: phase === "auth" ? "Sign in to sync" : phase === "storage" ? "Cannot save on this device" : phase === "offline" ? "Offline · edits saved on this device" : "Sync failed · try again" }));
  } finally {
    syncing = false;
    await refreshSyncState();
    if(syncAgain){syncAgain=false;queueMicrotask(()=>void sync());}
  }
}
export async function resolve(path: string, keepMine: boolean, reviewed: Note) {
  const d = await db;
  const p: Pending | undefined = await d.get("pending", path);
  if (!p) return;
  const n: Note = reviewed;
  if (keepMine) {
    await d.put("pending", {
      ...p,
      expected_checksum: n.checksum,
      operation_id: crypto.randomUUID(),
      conflict: undefined,
    });
  } else {
    await edit(
      "Conflicts/" + Date.now() + "-" + path.replaceAll("/", "-"),
      p.content,
    );
    await d.delete("pending", path);
  }
  await d.put("notes", n);
  await sync();
}

export async function addAttachment(path: string, blob: Blob) {
  localGeneration++;
  await (await db).put("attachments", { path, blob, pending: true, version: crypto.randomUUID() });
  await refreshSyncState();
}

export async function localAttachmentPaths():Promise<string[]>{return (await (await db).getAll("attachments")).map(f=>f.path);}
