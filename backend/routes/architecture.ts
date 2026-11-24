import { Router } from "express";
import rateLimit from "express-rate-limit";
import { generate, getLatest } from "../controllers/architectureController";
import { authenticate } from "../middleware/auth";
import { requireCanvasAccess } from "../middleware/canvasAccess";
import { userOrIpKey } from "../middleware/rateLimitKey";
import { validate } from "../middleware/validate";
import { generateRequestSchema } from "../schemas/architecture.schema";

// Generating reads a repo from GitHub, whose limit without a token is 60
// calls an hour for this whole server (2 per new read), and costs the
// user's own API credit. A few a minute is plenty for a person and keeps a
// script from draining either.
const generateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 diagrams per account (or IP) per 10 minutes
  keyGenerator: userOrIpKey,
  message: { error: "Too many diagrams generated, try again in a few minutes", code: "too_many" },
});

// Mounted at /api/canvases/:id/architecture.
const router = Router({ mergeParams: true });

router.get("/", authenticate, requireCanvasAccess, getLatest);
router.post("/", authenticate, requireCanvasAccess, generateLimiter, validate(generateRequestSchema), generate);

export default router;
