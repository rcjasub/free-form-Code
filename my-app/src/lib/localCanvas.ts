import type { RestorePayload } from "./restore";
import { SaveRejectedError } from "./saveErrors";

// A guest's canvas ("Try without an account") lives in this browser's
// IndexedDB, not on the server: nothing about it reaches the VM until they
// sign up or share it. IndexedDB rather than localStorage, which tops out
// around 5MB — a few pasted images would fill it.
//
// Rows are kept in the same shape the blocks API returns, so the canvas page
// handles them exactly like server blocks (see lib/blockStore).

export const LOCAL_CANVAS_ID = "local";

export function isLocalCanvas(canvasId: string | undefined): boolean {
  return canvasId === LOCAL_CANVAS_ID;
}

// A block saved in this browser, wherever it's shown. Besides the guest
// canvas's own blocks, that's a guest's images on a server canvas: the server
// only stores images for real accounts, so a guest's stay here (tagged with
// that canvas's id) and only they see them, until they sign up.
export function isLocalBlockId(blockId: string | undefined): boolean {
  return !!blockId && blockId.startsWith("local-");
}

export interface LocalBlock {
  id: string;
  canvas_id: string;
  type: string;
  language: string;
  content: string;
  x: number;
  y: number;
  width: number;
  link: string | null;
  wrap_width: number | null;
  font_size: number | null;
  // creation order: the server sorts by created_at, and later blocks draw on
  // top, so overlapping blocks keep the same stacking here
  seq: number;
  // stacking position, on the same scale as the server's z_index: it starts
  // as `seq` and selecting the block raises it. Rows saved before it existed
  // have none and use `seq` (see withZ).
  z_index?: number;
}

function withZ(row: LocalBlock): LocalBlock & { z_index: number } {
  return { ...row, z_index: row.z_index ?? row.seq };
}

// Same caps as the backend (MAX_BLOCKS_PER_CANVAS, MAX_CONTENT_LENGTH), so a
// canvas that fits here still fits on the server when it's uploaded.
export const MAX_LOCAL_BLOCKS = 500;
const MAX_CONTENT_LENGTH = 3_000_000;
const FULL_ERROR = "This canvas is full — delete some blocks (large images count the most) and try again";

const DB_NAME = "free-form";
const STORE = "blocks";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // a failed open (private mode, storage blocked) can be retried later
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

// Runs `work` in one transaction and resolves once it has committed — the
// point where the data is actually on disk.
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => T | Promise<T>): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Saving in this browser failed"));
  });
  let result: T;
  try {
    result = await work(tx.objectStore(STORE));
  } catch (err) {
    // nothing from a failed piece of work gets saved
    done.catch(() => {});
    try {
      tx.abort();
    } catch {
      // already finished or aborted
    }
    throw err;
  }
  await done;
  return result;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Not crypto.randomUUID(): that only exists on HTTPS/localhost.
function newId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let lastSeq = 0;
function nextSeq(): number {
  lastSeq = Math.max(Date.now(), lastSeq + 1);
  return lastSeq;
}

function makeRow(block: RestorePayload, canvasId: string): LocalBlock {
  if (block.content.length > MAX_CONTENT_LENGTH) throw new SaveRejectedError("Block content is too large", 413);
  const seq = nextSeq();
  return {
    id: newId(),
    canvas_id: canvasId,
    type: block.type,
    language: block.language,
    content: block.content,
    x: block.x,
    y: block.y,
    width: block.width,
    link: block.link,
    wrap_width: block.wrapWidth,
    font_size: block.fontSize,
    seq,
    z_index: block.zIndex ?? seq,
  };
}

function allRows(): Promise<LocalBlock[]> {
  return transact("readonly", (store) => request(store.getAll() as IDBRequest<LocalBlock[]>));
}

export async function getAllBlocks(canvasId = LOCAL_CANVAS_ID): Promise<{ data: LocalBlock[] }> {
  const rows = (await allRows()).filter((r) => r.canvas_id === canvasId);
  return { data: rows.sort((a, b) => a.seq - b.seq).map(withZ) };
}

// Every canvas this browser holds blocks for, with those blocks in order.
export async function getAllByCanvas(): Promise<Map<string, LocalBlock[]>> {
  const byCanvas = new Map<string, LocalBlock[]>();
  for (const row of (await allRows()).sort((a, b) => a.seq - b.seq).map(withZ)) {
    byCanvas.set(row.canvas_id, [...(byCanvas.get(row.canvas_id) ?? []), row]);
  }
  return byCanvas;
}

export async function hasBlocks(): Promise<boolean> {
  try {
    return (await transact("readonly", (store) => request(store.count()))) > 0;
  } catch {
    return false; // no IndexedDB here, so nothing saved in it either
  }
}

// Adds blocks, refusing (like the server) if they'd take the canvas past its cap.
export async function restoreBlocks(
  blocks: RestorePayload[],
  canvasId = LOCAL_CANVAS_ID,
): Promise<{ data: LocalBlock[] }> {
  const rows = blocks.map((b) => makeRow(b, canvasId));
  await transact("readwrite", async (store) => {
    const existing = (await request(store.getAll() as IDBRequest<LocalBlock[]>)).filter((r) => r.canvas_id === canvasId);
    if (existing.length + rows.length > MAX_LOCAL_BLOCKS) throw new SaveRejectedError(FULL_ERROR, 413);
    for (const row of rows) store.add(row);
  });
  return { data: rows };
}

async function createOne(
  block: Partial<RestorePayload> & { type: string; content: string; x: number; y: number; width: number },
  canvasId = LOCAL_CANVAS_ID,
) {
  const { data } = await restoreBlocks(
    [{ language: "javascript", link: null, wrapWidth: null, fontSize: null, ...block }],
    canvasId,
  );
  return { data: data[0] };
}

// The same calls as API/block.ts, minus the canvas id (there's only one).
// Like the server's create route, these ignore language, link and size —
// the canvas page sets those in follow-up calls.
export function createBlock(x: number, y: number) {
  return createOne({ type: "code", content: "", x, y, width: 300 });
}

export function createDrawingBlock(x: number, y: number, width: number, content: string) {
  return createOne({ type: "draw", content, x, y, width });
}

export function createBlockFrom(
  block: { type: string; content: string; x: number; y: number; width: number },
  canvasId = LOCAL_CANVAS_ID,
) {
  return createOne({ type: block.type, content: block.content, x: block.x, y: block.y, width: block.width }, canvasId);
}

async function patch(id: string, changes: Partial<LocalBlock>): Promise<{ data: LocalBlock }> {
  if (typeof changes.content === "string" && changes.content.length > MAX_CONTENT_LENGTH) {
    throw new SaveRejectedError("Block content is too large", 413);
  }
  const row = await transact("readwrite", async (store) => {
    const current = await request(store.get(id) as IDBRequest<LocalBlock | undefined>);
    if (!current) return null;
    const next = { ...current, ...changes };
    store.put(next);
    return next;
  });
  if (!row) throw new SaveRejectedError("Block not found", 404);
  return { data: row };
}

export function updateBlockPosition(id: string, x: number, y: number) {
  return patch(id, { x, y });
}

export function updateBlockContent(id: string, content: string) {
  return patch(id, { content });
}

export function updateBlockLanguage(id: string, language: string) {
  return patch(id, { language });
}

export function updateBlockLink(id: string, link: string | null) {
  return patch(id, { link });
}

export function updateBlockSize(id: string, size: { wrapWidth: number | null; fontSize: number | null }) {
  return patch(id, { wrap_width: size.wrapWidth, font_size: size.fontSize });
}

// Raised blocks' new positions, all in one transaction. A block that's gone
// is skipped, like the server does.
export async function updateBlockStack(blocks: { id: string; zIndex: number }[]): Promise<void> {
  await transact("readwrite", async (store) => {
    for (const { id, zIndex } of blocks) {
      const row = await request(store.get(id) as IDBRequest<LocalBlock | undefined>);
      if (row) store.put({ ...row, z_index: zIndex });
    }
  });
}

export async function deleteBlock(id: string): Promise<void> {
  await transact("readwrite", (store) => {
    store.delete(id);
  });
}

export async function deleteBlocks(ids: string[]): Promise<void> {
  await transact("readwrite", (store) => {
    for (const id of ids) store.delete(id);
  });
}

// Moves blocks over to another canvas, still in this browser — a guest's
// images when their canvas moves online without them.
export async function reassignBlocks(ids: string[], canvasId: string): Promise<void> {
  await transact("readwrite", async (store) => {
    for (const id of ids) {
      const row = await request(store.get(id) as IDBRequest<LocalBlock | undefined>);
      if (row) store.put({ ...row, canvas_id: canvasId });
    }
  });
}

// Asks the browser not to clear this site's storage when space runs low.
// Best effort: browsers may say no, and clearing site data by hand still
// deletes it — which is why the canvas page says so.
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {});
}

// ── Backup file ───────────────────────────────────────────────────────────

const FILE_APP = "free-form";
const FILE_VERSION = 1;
// What the server's restore route accepts (restoreBlocksSchema), so a
// restored backup can still be uploaded on sign-up.
const FILE_TYPES = new Set(["text", "code", "draw", "image"]);
const FILE_LANGUAGES = new Set(["javascript", "python", "cpp", "java", "text"]);

export function toRestorePayload(row: LocalBlock): RestorePayload {
  return {
    type: row.type,
    content: row.content,
    x: row.x,
    y: row.y,
    width: row.width,
    language: row.language,
    link: row.link,
    wrapWidth: row.wrap_width,
    fontSize: row.font_size,
    zIndex: row.z_index ?? row.seq,
  };
}

export function toCanvasFile(blocks: RestorePayload[]): string {
  return JSON.stringify({ app: FILE_APP, version: FILE_VERSION, blocks });
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inRangeOrNull = (v: unknown, min: number, max: number) => v === null || (isNum(v) && v >= min && v <= max);

// Reads a backup made by toCanvasFile. Anything that isn't one is rejected
// with a message for the user, rather than half-imported.
export function parseCanvasFile(text: string): RestorePayload[] {
  const notOurs = "That file isn't a free-form canvas backup.";
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error(notOurs);
  }
  const f = file as { app?: unknown; version?: unknown; blocks?: unknown };
  if (f?.app !== FILE_APP || !Array.isArray(f.blocks)) throw new Error(notOurs);
  if (f.version !== FILE_VERSION) throw new Error("That backup was made by a newer version of free-form.");
  if (f.blocks.length > MAX_LOCAL_BLOCKS) throw new Error(FULL_ERROR);

  return f.blocks.map((raw: unknown, i: number) => {
    const b = raw as Record<string, unknown>;
    const ok =
      b !== null &&
      typeof b === "object" &&
      typeof b.type === "string" &&
      FILE_TYPES.has(b.type) &&
      typeof b.content === "string" &&
      b.content.length <= MAX_CONTENT_LENGTH &&
      isNum(b.x) &&
      isNum(b.y) &&
      isNum(b.width) &&
      b.width > 0 &&
      typeof b.language === "string" &&
      FILE_LANGUAGES.has(b.language) &&
      (b.link === null || (typeof b.link === "string" && b.link.length <= 2048 && /^https?:\/\//i.test(b.link))) &&
      inRangeOrNull(b.wrapWidth, 40, 4000) &&
      inRangeOrNull(b.fontSize, 6, 200) &&
      // optional: backups made before stacking was saved don't have it
      (b.zIndex === undefined || (isNum(b.zIndex) && b.zIndex >= 0 && b.zIndex <= 1e15));
    if (!ok) throw new Error(`That backup is damaged (block ${i + 1}).`);
    return {
      type: b.type as string,
      content: b.content as string,
      x: b.x as number,
      y: b.y as number,
      width: b.width as number,
      language: b.language as string,
      link: b.link as string | null,
      wrapWidth: b.wrapWidth as number | null,
      fontSize: b.fontSize as number | null,
      zIndex: b.zIndex as number | undefined,
    };
  });
}
