import { Router } from "express";
import {
  createCanva,
  getCanvasById,
  getCanvasByShareId,
  updateCanvasName,
  deleteCanvas,
} from "../controllers/canvasController";

const router = Router();

router.post("/", createCanva);
router.get("/share/:id", getCanvasByShareId);
router.get("/:id", getCanvasById);
router.put("/:id", updateCanvasName); 
router.delete("/:id", deleteCanvas); 


export default router;
