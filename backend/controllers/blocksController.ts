import { Response } from "express";
import * as Blocks from "../models/blocks";
import { AuthRequest } from "../middleware/auth";
import { handleServerError } from "../utils/errors";
import { cacheGet, cacheSet, cacheDel } from "../redis";

// Per-canvas quota. The per-block size limit (MAX_CONTENT_LENGTH) alone can't
// keep the disk from filling — anyone on a public canvas could keep adding
// max-size blocks — so a canvas also caps its block count and total content.
export const MAX_BLOCKS_PER_CANVAS = 500;
export const MAX_CANVAS_CONTENT = 50_000_000; // characters, ~50 MB

const QUOTA_ERROR = "This canvas is full — delete some blocks (large images count the most) and try again";

// Images are by far the biggest blocks, so only real accounts store them on
// the server. A guest's images stay in their own browser (the frontend keeps
// them in IndexedDB), and anyone without an account — including visitors
// editing through a share link — can't add them here.
const IMAGE_ERROR = "Sign up to add images to a shared canvas";

function canStoreImages(req: AuthRequest): boolean {
  return !!req.user && !req.user.isGuest;
}

function exceedsQuota(usage: Blocks.CanvasUsage, newContentLength: number, addingBlock: boolean): boolean {
  if (addingBlock && usage.count >= MAX_BLOCKS_PER_CANVAS) return true;
  return usage.chars + newContentLength > MAX_CANVAS_CONTENT;
}

export async function getAllBlocks(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;

  // Redis is a cache, not the source of truth — if it's unreachable or
  // slow, fall through to Postgres instead of failing (or hanging) the
  // request. cacheGet/cacheSet below swallow their own errors for the
  // same reason.
  const cached = await cacheGet(`blocks:${id}`);
  if (cached) {
    res.status(200).json(JSON.parse(cached));
    return;
  }

  try {
    const allblocks = await Blocks.getBlocksByCanvasId(id);

    await cacheSet(`blocks:${id}`, JSON.stringify(allblocks));
    res.status(200).json(allblocks);
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function createBlock(req: AuthRequest, res: Response): Promise<void> {
  const { id: canvasId } = req.params;
  const { type, content, x, y, width } = req.body;

  if (type === "image" && !canStoreImages(req)) {
    res.status(403).json({ error: IMAGE_ERROR });
    return;
  }

  try {
    const usage = await Blocks.getCanvasUsage(canvasId);
    if (exceedsQuota(usage, content.length, true)) {
      res.status(413).json({ error: QUOTA_ERROR });
      return;
    }

    const block = await Blocks.CreateBlock({
      canvasId,
      type,
      content,
      x,
      y,
      width,
    });
    
    await cacheDel(`blocks:${canvasId}`);
    res.status(201).json(block);
  } catch (err) {
    handleServerError(res, err);
  }
}

// Undoing a big delete, or uploading a browser canvas: puts the blocks back
// in one request (see restoreBlocksSchema). The quota counts all of them
// together, except ones already uploaded (same clientId), which aren't added.
export async function restoreBlocks(req: AuthRequest, res: Response): Promise<void> {
  const { id: canvasId } = req.params;
  const { blocks } = req.body as { blocks: Blocks.RestoreBlockParams[] };

  if (blocks.some((b) => b.type === "image") && !canStoreImages(req)) {
    res.status(403).json({ error: IMAGE_ERROR });
    return;
  }

  try {
    const usage = await Blocks.getCanvasUsage(canvasId);
    const saved = await Blocks.existingClientIds(
      canvasId,
      blocks.flatMap((b) => (b.clientId ? [b.clientId] : [])),
    );
    const fresh = blocks.filter((b) => !b.clientId || !saved.has(b.clientId));
    const chars = fresh.reduce((sum, b) => sum + b.content.length, 0);
    if (usage.count + fresh.length > MAX_BLOCKS_PER_CANVAS || exceedsQuota(usage, chars, false)) {
      res.status(413).json({ error: QUOTA_ERROR });
      return;
    }

    const rows = await Blocks.restoreBlocks(canvasId, blocks);
    await cacheDel(`blocks:${canvasId}`);
    res.status(201).json(rows);
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function deleteBlock(req: AuthRequest, res: Response): Promise<void> {
  const { id: canvasId, blockId } = req.params;

  if (!blockId) {
    res.status(400).json({ error: "Block ID is required" });
    return;
  }

  try {
    const block = await Blocks.deleteBlock(canvasId, blockId);

    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    await cacheDel(`blocks:${block.canvas_id}`);
    res.status(200).json({ message: "Delete Block Successfully" });
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function updateBlock(req: AuthRequest, res: Response): Promise<void> {
  const { id: canvasId, blockId } = req.params;
  const { x, y } = req.body;

  if (!blockId) {
    res.status(400).json({ error: "Block ID is required" });
    return;
  }

  try {
    const block = await Blocks.updateBlockPosition(canvasId, blockId, x, y);
    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    await cacheDel(`blocks:${block.canvas_id}`);
    res.status(200).json(block);
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function updateBlockContent(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id: canvasId, blockId } = req.params;
  const { content } = req.body;

  try {
    const usage = await Blocks.getCanvasUsage(canvasId, blockId);
    if (exceedsQuota(usage, content.length, false)) {
      res.status(413).json({ error: QUOTA_ERROR });
      return;
    }

    const block = await Blocks.updateBlockContent(canvasId, blockId, content);
    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    await cacheDel(`blocks:${block.canvas_id}`);
    res.status(200).json(block);
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function updateBlockLanguage(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id: canvasId, blockId } = req.params;
  const { language } = req.body;

  try {
    const block = await Blocks.updateBlockLanguage(canvasId, blockId, language);
    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    await cacheDel(`blocks:${block.canvas_id}`);
    res.status(200).json(block);
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function updateBlockSize(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id: canvasId, blockId } = req.params;
  const { wrapWidth, fontSize } = req.body;

  try {
    const block = await Blocks.updateBlockSize(canvasId, blockId, { wrapWidth, fontSize });
    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    await cacheDel(`blocks:${block.canvas_id}`);
    res.status(200).json(block);
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function updateBlockLink(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id: canvasId, blockId } = req.params;
  const { link } = req.body;

  try {
    const block = await Blocks.updateBlockLink(canvasId, blockId, link);
    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    await cacheDel(`blocks:${block.canvas_id}`);
    res.status(200).json(block);
  } catch (err) {
    handleServerError(res, err);
  }
}

// Raising blocks: sets their stacking positions in one go. Ids that aren't
// on this canvas are skipped, so the response lists only what changed.
export async function updateBlockStack(req: AuthRequest, res: Response): Promise<void> {
  const { id: canvasId } = req.params;
  const { blocks } = req.body as { blocks: Blocks.StackEntry[] };

  try {
    const rows = await Blocks.updateBlockStack(canvasId, blocks);
    if (rows.length > 0) await cacheDel(`blocks:${canvasId}`);
    res.status(200).json(rows);
  } catch (err) {
    handleServerError(res, err);
  }
}
