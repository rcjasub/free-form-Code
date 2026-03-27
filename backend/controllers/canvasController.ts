import { Request, Response } from "express";
import { randomBytes } from "crypto";
import * as Canvas from "../models/canvas";

function generateShareId(length = 12): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

export async function createCanvas(req: Request, res: Response): Promise<void> {
  const { user_id, name = "Untitled", is_public = false } = req.body;

  if (!user_id) {
    res.status(400).json({ error: "user_id is required" });
    return;
  }

  try {
    const share_id = generateShareId();
    const canvas = await Canvas.create({ user_id, name, share_id, is_public });
    res.status(201).json(canvas);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function getCanvasById(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  try {
    const canvas = await Canvas.getById(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    res.status(200).json(canvas);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
