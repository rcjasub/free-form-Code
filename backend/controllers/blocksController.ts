import { Request, Response } from "express";
import * as blocks from "../models/blocks";

export async function getAllBlocks(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const allblocks = await blocks.getBlocksByCanvasId(id);
    res.status(200).json(allblocks);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

//Do later
//  POST   /api/canvas/:canvasId/blocks       — create a block
//   PUT    /api/canvas/:canvasId/blocks/:id   — update position/content
//   DELETE /api/canvas/:canvasId/blocks/:id   — delete a blockf