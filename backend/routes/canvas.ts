import { Router } from "express";
import {
  createCanva,
  getUserCanvases,
  getCanvasById,
  getCanvasByShareId,
  updateCanvas,
  deleteCanvas,
} from "../controllers/canvasController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createSchema, updateSchema } from "../schemas/canvas.schema";

const router = Router();

router.get("/share/:id", getCanvasByShareId);
router.get("/", authenticate, getUserCanvases);
router.get("/:id", authenticate, getCanvasById);
router.post("/", authenticate, validate(createSchema), createCanva);
router.put("/:id", authenticate, validate(updateSchema), updateCanvas);
router.delete("/:id", authenticate, deleteCanvas);

export default router;
