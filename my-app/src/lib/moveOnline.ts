import { getMe, startGuest } from "../API/auth";
import { getMyCanvases, createCanvas } from "../API/canvas";
import { getAllBlocks, restoreBlocks } from "../API/block";
import { chunkForRestore, type RestorePayload } from "./restore";
import { boxesOf, clearOffset } from "./placement";
import * as local from "./localCanvas";

// A block to upload, with its id in this browser's storage.
export interface LocalUpload {
  id: string;
  block: RestorePayload;
}

function fromRows(rows: local.LocalBlock[]): LocalUpload[] {
  return rows.map((row) => ({ id: row.id, block: local.toRestorePayload(row) }));
}

// Uploads blocks into a server canvas, removing each batch from this browser
// once it's saved — one copy, not two drifting apart. If a later batch fails,
// a retry uploads only what's left instead of duplicating what made it; and
// each block carries its browser id, so a batch the server saved but whose
// answer got lost isn't added twice either. Resolves to the saved rows.
async function upload(canvasId: string, pending: LocalUpload[]) {
  const rows = [];
  const blocks = pending.map((p) => (local.isLocalBlockId(p.id) ? { ...p.block, clientId: p.id } : p.block));
  for (const chunk of chunkForRestore(blocks)) {
    rows.push(...(await restoreBlocks(canvasId, chunk)).data);
    const saved = pending.splice(0, chunk.length);
    await local.deleteBlocks(saved.map((p) => p.id));
  }
  return rows;
}

// Moves a group about to be uploaded into a canvas that already has blocks
// off of them, if it would land on top (see lib/placement).
async function placeBeside(canvasId: string, pending: LocalUpload[]): Promise<LocalUpload[]> {
  const { data } = await getAllBlocks(canvasId);
  if (data.length === 0 || pending.length === 0) return pending;
  const existing = await boxesOf(data.map(local.toRestorePayload));
  const { dx, dy } = clearOffset(await boxesOf(pending.map((p) => p.block)), existing);
  if (dx === 0 && dy === 0) return pending;
  return pending.map((p) => ({ ...p, block: { ...p.block, x: p.block.x + dx, y: p.block.y + dy } }));
}

// Moves the browser-only guest canvas to the server. Resolves to the server
// canvas id. `blocks` defaults to what's in IndexedDB; the canvas page passes
// what it shows instead, which includes edits whose save is still debounced.
//
// Where it goes: a new canvas for a logged-in user, the existing canvas of an
// older server-side guest, or — nobody logged in, e.g. a guest sharing — a
// new server guest account, made only now that the canvas needs the server.
//
// The server doesn't store guests' images, so when it lands in a guest
// account they stay in this browser, now shown on the server canvas — only
// to this guest — until they sign up (see uploadAfterSignUp).
export async function moveLocalCanvasOnline(blocks?: LocalUpload[]): Promise<string> {
  let pending = blocks ?? fromRows((await local.getAllBlocks()).data);
  const { canvasId, guest, fresh } = await pickTarget();
  if (!fresh) pending = await placeBeside(canvasId, pending);

  const images = guest ? pending.filter((p) => p.block.type === "image") : [];
  await upload(canvasId, pending.filter((p) => !images.includes(p)));
  for (const p of images) await local.updateBlockPosition(p.id, p.block.x, p.block.y);
  await local.reassignBlocks(images.map((p) => p.id), canvasId);
  return canvasId;
}

// `fresh`: a canvas made just now, so there's nothing on it to land on.
async function pickTarget(): Promise<{ canvasId: string; guest: boolean; fresh: boolean }> {
  const me = await getMe();
  if (!me) return { canvasId: (await startGuest()).data.canvasId, guest: true, fresh: true };
  if (me.isGuest) {
    const { data } = await getMyCanvases();
    if (data[0]) return { canvasId: data[0].id, guest: true, fresh: false };
  }
  return { canvasId: (await createCanvas("From this browser")).data.id, guest: false, fresh: true };
}

// Right after sign-up: everything this browser holds goes to the new
// account — the guest canvas into `accountCanvasId` (the canvas the account
// came with), and images kept for a server canvas into that canvas, which is
// now the account's own. Resolves to where the guest canvas went, if it had
// anything. Anything that fails stays in the browser.
export async function uploadAfterSignUp(accountCanvasId: string): Promise<string | null> {
  let movedTo: string | null = null;
  let failed: unknown = null;
  for (const [canvasId, rows] of await local.getAllByCanvas()) {
    const isGuestCanvas = local.isLocalCanvas(canvasId);
    const target = isGuestCanvas ? accountCanvasId : canvasId;
    try {
      // images kept for a server canvas were placed there on purpose; only
      // the guest canvas moves aside if it would cover what's on the target
      await upload(target, isGuestCanvas ? await placeBeside(target, fromRows(rows)) : fromRows(rows));
      if (isGuestCanvas) movedTo = target;
    } catch (err) {
      failed = err;
    }
  }
  if (failed) throw failed;
  return movedTo;
}

// Uploads what this browser still keeps for a server canvas — images left
// behind when uploading after sign-up failed. Resolves to the saved rows.
export async function uploadKept(canvasId: string) {
  return upload(canvasId, fromRows((await local.getAllBlocks(canvasId)).data));
}
