import { Router } from "express";
import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
  updateBlockContent,
} from "../controllers/blocksController";

// mergeParams: true allows this router to access :id from the parent route in server.ts
const router = Router({ mergeParams: true });

router.get("/", getAllBlocks);
router.post("/", createBlock);
router.delete("/:blockId", deleteBlock);
router.put("/:blockId", updateBlock);
router.patch("/:blockId/content", updateBlockContent);

export default router;
