import { Request, Response } from "express";
import * as Blocks from "../models/blocks";
import redis from "../redis";

export async function getAllBlocks(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const cached = await redis.get(`blocks:${id}`);
  if (cached) {
    res.status(200).json(JSON.parse(cached));
    return;
  }

  try {
    const allblocks = await Blocks.getBlocksByCanvasId(id);

    await redis.set(`blocks:${id}`, JSON.stringify(allblocks), "EX", 3000);
    res.status(200).json(allblocks);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function createBlock(req: Request, res: Response): Promise<void> {
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
    
    await redis.del(`blocks:${canvasId}`);
    res.status(201).json(block);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function deleteBlock(req: Request, res: Response): Promise<void> {
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

    await redis.del(`blocks:${block.canvas_id}`);
    res.status(200).json({ message: "Delete Block Successfully" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function updateBlock(req: Request, res: Response): Promise<void> {
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

    await redis.del(`blocks:${block.canvas_id}`);
    res.status(200).json(block);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function updateBlockContent(
  req: Request,
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

    await redis.del(`blocks:${block.canvas_id}`);
    res.status(200).json(block);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
