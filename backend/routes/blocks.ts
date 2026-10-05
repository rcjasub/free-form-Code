import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
  updateBlockContent,
  updateBlockLanguage,
  updateBlockLink,
} from "../controllers/blocksController";
import { optionalAuthenticate } from "../middleware/auth";
import { requireCanvasAccess } from "../middleware/canvasAccess";
import { validate } from "../middleware/validate";
import { userOrIpKey } from "../middleware/rateLimitKey";
import { createSchema, updateBlockSchema, updateBlockContentSchema, updateBlockLanguageSchema, updateBlockLinkSchema } from "../schemas/block.schema"

// Every write (typing saves are debounced to one per 800ms, moves to one per
// drag) — generous for real editing, but stops a script hammering the DB.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: userOrIpKey,
  message: { error: "Too many changes too fast, slow down for a minute" },
});

// New blocks specifically: each can carry up to 3MB (a pasted image), so this
// is what bounds how fast someone can grow a canvas toward its quota.
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: userOrIpKey,
  message: { error: "Too many new blocks, try again in a minute" },
});

// mergeParams: true allows this router to access :id from the parent route in server.ts
const router = Router({ mergeParams: true });

// optionalAuthenticate identifies who's asking, if anyone; requireCanvasAccess
// confirms they're allowed to touch *this* canvas's blocks (owner, or canvas
// is public — which is what lets an invited guest with no account view and
// edit a shared canvas's blocks at all).
router.use(optionalAuthenticate, requireCanvasAccess);

router.get("/", getAllBlocks);
router.post("/", writeLimiter, createLimiter, validate(createSchema), createBlock);
router.delete("/:blockId", writeLimiter, deleteBlock);
router.put("/:blockId", writeLimiter, validate(updateBlockSchema), updateBlock);
router.patch("/:blockId/content", writeLimiter, validate(updateBlockContentSchema), updateBlockContent);
router.patch("/:blockId/language", writeLimiter, validate(updateBlockLanguageSchema), updateBlockLanguage);
router.patch("/:blockId/link", writeLimiter, validate(updateBlockLinkSchema), updateBlockLink);

export default router;
