import { Router } from "express";
import {
  createCanva,
  getUserCanvases,
  getCanvasById,
  getCanvasByShareId,
  updateCanvasName,
  deleteCanvas,
} from "../controllers/canvasController";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/share/:id", getCanvasByShareId); // public — share link access
router.get("/", authenticate, getUserCanvases);
router.get("/:id", authenticate, getCanvasById);
router.post("/", authenticate, createCanva);
router.put("/:id", authenticate, updateCanvasName);
router.delete("/:id", authenticate, deleteCanvas);

export default router;
