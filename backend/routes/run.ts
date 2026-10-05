import { Router } from "express";
import { runCode } from "../controllers/runController";
import rateLimit from "express-rate-limit";
import { optionalAuthenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { userOrIpKey } from "../middleware/rateLimitKey";
import { runSchema } from "../schemas/run.schema";

const runLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 runs per minute per account (or per IP without one)
  keyGenerator: userOrIpKey,
  message: { error: "Too many code executions, try again in a minute" },
});

const router = Router();

router.post("/", optionalAuthenticate, runLimiter, validate(runSchema), runCode);

export default router;
