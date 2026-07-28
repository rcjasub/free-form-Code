import { Router } from "express";
import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
  updateBlockContent,
} from "../controllers/blocksController";
import { authenticate } from "../middleware/auth";
import { requireCanvasAccess } from "../middleware/canvasAccess";
import { validate } from "../middleware/validate";
import { createSchema, updateBlockSchema, updateBlockContentSchema} from "../schemas/block.schema"


// mergeParams: true allows this router to access :id from the parent route in server.ts
const router = Router({ mergeParams: true });

// authenticate confirms who's asking; requireCanvasAccess confirms they're
// allowed to touch *this* canvas's blocks (owner, or canvas is public).
router.use(authenticate, requireCanvasAccess);

router.get("/", getAllBlocks);
router.post("/", validate(createSchema), createBlock);
router.delete("/:blockId", deleteBlock);
router.put("/:blockId", validate(updateBlockSchema), updateBlock);
router.patch("/:blockId/content", validate(updateBlockContentSchema), updateBlockContent);

export default router;
