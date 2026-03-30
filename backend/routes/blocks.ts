import { Router } from "express";
import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
} from "../controllers/blocksController";

// mergeParams: true allows this router to access :id from the parent route in server.ts
const router = Router({ mergeParams: true });

router.get("/", getAllBlocks);
router.post("/", createBlock);
router.delete("/:blockId", deleteBlock);
router.put("/:blockId", updateBlock);

export default router;
