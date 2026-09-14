import { Router } from "express";
import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
  updateBlockContent,
} from "../controllers/blocksController";
import { optionalAuthenticate } from "../middleware/auth";
import { requireCanvasAccess } from "../middleware/canvasAccess";
import { validate } from "../middleware/validate";
import { createSchema, updateBlockSchema, updateBlockContentSchema} from "../schemas/block.schema"


// mergeParams: true allows this router to access :id from the parent route in server.ts
const router = Router({ mergeParams: true });

// optionalAuthenticate identifies who's asking, if anyone; requireCanvasAccess
// confirms they're allowed to touch *this* canvas's blocks (owner, or canvas
// is public — which is what lets an invited guest with no account view and
// edit a shared canvas's blocks at all).
router.use(optionalAuthenticate, requireCanvasAccess);

router.get("/", getAllBlocks);
router.post("/", validate(createSchema), createBlock);
router.delete("/:blockId", deleteBlock);
router.put("/:blockId", validate(updateBlockSchema), updateBlock);
router.patch("/:blockId/content", validate(updateBlockContentSchema), updateBlockContent);

export default router;
