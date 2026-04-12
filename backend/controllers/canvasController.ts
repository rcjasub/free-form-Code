import { Response } from "express";
import { randomBytes } from "crypto";
import * as Canvas from "../models/canvas";
import { AuthRequest } from "../middleware/auth";
import redis from "../redis";

function generateShareId(length = 12): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

export async function getCanvasById(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  const cached = await redis.get(`canvas:${id}`);
  if (cached) {
    res.status(200).json(JSON.parse(cached));
    return;
  }

  try {
    const canvas = await Canvas.getById(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }

    await redis.set(`canvas:${id}`, JSON.stringify(canvas), "EX", 3600); // hour
    res.status(200).json(canvas);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function createCanva(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { name = "Untitled", is_public = false } = req.body;
  const user_id = req.user!.id;

  try {
    const share_id = generateShareId();
    const canvas = await Canvas.create({ user_id, name, share_id, is_public });
    res.status(201).json(canvas);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function getCanvasByShareId(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  const cached = await redis.get(`share:${id}`);
  if (cached) {
    res.status(200).json(JSON.parse(cached));
    return;
  }

  try {
    const canvas = await Canvas.getCanvasByShareId(id);
    if (!canvas) {
      res.status(404).json({ error: "Shared Canvas not found" });
      return;
    }

    await redis.set(`share:${id}`, JSON.stringify(canvas), "EX", 3600);
    res.status(200).json(canvas);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function getUserCanvases(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const user_id = req.user!.id;
  try {
    const canvases = await Canvas.getByUserId(user_id);
    res.status(200).json(canvases);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function updateCanvas(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const { name, is_public } = req.body;

  if (name === undefined && is_public === undefined) {
    res.status(400).json({ error: "name or is_public is required" });
    return;
  }

  try {
    const canvas = await Canvas.updateCanvas(id, { name, is_public });
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    await redis.del(`canvas:${id}`);
    res.status(200).json(canvas);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function deleteCanvas(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: "Canvas ID is required" });
    return;
  }

  try {
    const canvas = await Canvas.deleteCanvas(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }

    await redis.del(`canvas:${id}`);
    res.status(200).json({ message: "Canvas Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

