import { Response } from "express";
import * as Blocks from "../models/blocks";
import { AuthRequest } from "../middleware/auth";
import { handleServerError } from "../utils/errors";
import { cacheGet, cacheSet, cacheDel } from "../redis";

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

  try {
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

export async function deleteBlock(req: AuthRequest, res: Response): Promise<void> {
  const { blockId } = req.params;

  if (!blockId) {
    res.status(400).json({ error: "Block ID is required" });
    return;
  }

  try {
    const block = await Blocks.deleteBlock(blockId);

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
  const { blockId } = req.params;
  const { x, y } = req.body;

  if (!blockId) {
    res.status(400).json({ error: "Block ID is required" });
    return;
  }

  try {
    const block = await Blocks.updateBlockPosition(blockId, x, y);
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
  const { blockId } = req.params;
  const { content } = req.body;

  try {
    const block = await Blocks.updateBlockContent(blockId, content);
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
