import { Response, NextFunction } from "express";
import * as Canvas from "../models/canvas";
import { AuthRequest } from "./auth";
import { handleServerError } from "../utils/errors";

// Guards routes mounted under /canvases/:id/* (mergeParams) so a logged-in
// user can only read/write blocks on canvases they own or that are public.
// Without this, authenticate alone lets any account touch any canvas ID.
export async function requireCanvasAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { id } = req.params;

  try {
    const canvas = await Canvas.getById(id);
    if (!canvas) {
      res.status(404).json({ error: "Canvas not found" });
      return;
    }
    if (canvas.user_id !== req.user!.id && !canvas.is_public) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  } catch (err) {
    handleServerError(res, err);
  }
}
