import axios from "axios";
import * as server from "../API/block";
import * as local from "./localCanvas";
import type { RestorePayload } from "./restore";

// The block calls the canvas page makes, sent to the server or to this
// browser's IndexedDB (lib/localCanvas). Same names and arguments as
// API/block.ts, and both resolve to { data } in the API's row shape, so the
// page doesn't care which one it's talking to.
//
// Browser-side: everything on the guest canvas, plus — on a server canvas —
// images added by a guest (`imagesInBrowser`), which the server won't store.
// Later edits find their way by the block's id (local-…).

const isLocal = local.isLocalCanvas;
const inBrowser = (canvasId: string, blockId: string) => isLocal(canvasId) || local.isLocalBlockId(blockId);

// What the canvas page shows: the server's blocks plus any this browser keeps
// for that canvas (a guest's images), or only the browser's for the guest canvas.
export async function getAllBlocks(canvasId: string) {
  if (isLocal(canvasId)) return local.getAllBlocks();
  const [{ data }, kept] = await Promise.all([
    server.getAllBlocks(canvasId).catch(async (err) => {
      // The canvas is gone (e.g. its guest was cleaned up), so whatever this
      // browser kept for it has nowhere to go.
      if (axios.isAxiosError(err) && err.response?.status === 404) await forgetKept(canvasId);
      throw err;
    }),
    local.getAllBlocks(canvasId).catch(() => ({ data: [] })),
  ]);
  return { data: [...data, ...kept.data] };
}

async function forgetKept(canvasId: string) {
  try {
    const { data } = await local.getAllBlocks(canvasId);
    await local.deleteBlocks(data.map((b) => b.id));
  } catch {
    // no IndexedDB here, so nothing kept in it either
  }
}

export function createBlock(canvasId: string, x: number, y: number) {
  return isLocal(canvasId) ? local.createBlock(x, y) : server.createBlock(canvasId, x, y);
}

export function createDrawingBlock(canvasId: string, x: number, y: number, width: number, content: string) {
  return isLocal(canvasId)
    ? local.createDrawingBlock(x, y, width, content)
    : server.createDrawingBlock(canvasId, x, y, width, content);
}

export function createBlockFrom(
  canvasId: string,
  block: { type: string; content: string; x: number; y: number; width: number },
  imagesInBrowser = false,
) {
  return isLocal(canvasId) || (imagesInBrowser && block.type === "image")
    ? local.createBlockFrom(block, canvasId)
    : server.createBlockFrom(canvasId, block);
}

export function updateBlockPosition(canvasId: string, blockId: string, x: number, y: number) {
  return inBrowser(canvasId, blockId)
    ? local.updateBlockPosition(blockId, x, y)
    : server.updateBlockPosition(canvasId, blockId, x, y);
}

export function deleteBlock(canvasId: string, blockId: string) {
  return inBrowser(canvasId, blockId) ? local.deleteBlock(blockId) : server.deleteBlock(canvasId, blockId);
}

export function updateBlockContent(canvasId: string, blockId: string, content: string) {
  return inBrowser(canvasId, blockId)
    ? local.updateBlockContent(blockId, content)
    : server.updateBlockContent(canvasId, blockId, content);
}

export function updateBlockLink(canvasId: string, blockId: string, link: string | null) {
  return inBrowser(canvasId, blockId)
    ? local.updateBlockLink(blockId, link)
    : server.updateBlockLink(canvasId, blockId, link);
}

// Resolves to the new rows in the same order as `blocks`, wherever each went.
export async function restoreBlocks(canvasId: string, blocks: RestorePayload[], imagesInBrowser = false) {
  if (isLocal(canvasId)) return local.restoreBlocks(blocks);
  const keepHere = (b: RestorePayload) => imagesInBrowser && b.type === "image";
  const toBrowser = blocks.filter(keepHere);
  if (toBrowser.length === 0) return server.restoreBlocks(canvasId, blocks);

  const toServer = blocks.filter((b) => !keepHere(b));
  const [saved, kept] = await Promise.all([
    toServer.length ? server.restoreBlocks(canvasId, toServer).then((r) => r.data) : Promise.resolve([]),
    local.restoreBlocks(toBrowser, canvasId).then((r) => r.data),
  ]);
  let s = 0;
  let k = 0;
  return { data: blocks.map((b) => (keepHere(b) ? kept[k++] : saved[s++])) };
}

export function updateBlockSize(
  canvasId: string,
  blockId: string,
  size: { wrapWidth: number | null; fontSize: number | null },
) {
  return inBrowser(canvasId, blockId)
    ? local.updateBlockSize(blockId, size)
    : server.updateBlockSize(canvasId, blockId, size);
}

export function updateBlockLanguage(canvasId: string, blockId: string, language: string) {
  return inBrowser(canvasId, blockId)
    ? local.updateBlockLanguage(blockId, language)
    : server.updateBlockLanguage(canvasId, blockId, language);
}

// Each block's new position goes wherever that block lives — a canvas can
// mix server blocks with ones kept in this browser.
export async function updateBlockStack(canvasId: string, blocks: { id: string; zIndex: number }[]) {
  const here = blocks.filter((b) => inBrowser(canvasId, b.id));
  const there = blocks.filter((b) => !inBrowser(canvasId, b.id));
  await Promise.all([
    here.length ? local.updateBlockStack(here) : null,
    there.length ? server.updateBlockStack(canvasId, there) : null,
  ]);
}
