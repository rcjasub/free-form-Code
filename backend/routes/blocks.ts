import { Router } from "express";
import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
  updateBlockContent,
} from "../controllers/blocksController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createSchema, updateBlockSchema, updateBlockContentSchema} from "../schemas/block.schema"


// mergeParams: true allows this router to access :id from the parent route in server.ts
const router = Router({ mergeParams: true });

router.use(authenticate);

router.get("/", getAllBlocks);
router.post("/", validate(createSchema), createBlock);
router.delete("/:blockId", deleteBlock);
router.put("/:blockId", validate(updateBlockSchema), updateBlock);
router.patch("/:blockId/content", validate(updateBlockContentSchema), updateBlockContent);

export default router;
