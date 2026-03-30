import { Router } from "express";
import {
  createCanva,
  getCanvasById,
  getCanvasByShareId,
} from "../controllers/canvasController";

const router = Router();

router.post("/", createCanva);
router.get("/share/:id", getCanvasByShareId);
router.get("/:id", getCanvasById);

export default router;
