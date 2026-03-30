import { Request, Response } from "express";
import * as Blocks from "../models/blocks";

export async function getAllBlocks(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const allblocks = await Blocks.getBlocksByCanvasId(id);
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
    res.status(201).json(block);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function deleteBlock(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: "Block ID is required" });
    return;
  }

  try {
    const block = await Blocks.deleteBlock(id);

    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    res.status(200).json({ message: "Delete Block Successfully" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function updateBlock(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { x, y } = req.body;

  if (!id) {
    res.status(400).json({ error: "Block ID is required" });
    return;
  }

  try {
    const block = await Blocks.updateBlockPosition(id, x, y);
    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }
    res.status(200).json(block);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

