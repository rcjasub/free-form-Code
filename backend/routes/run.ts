import { Router } from "express";
import { runCode } from "../controllers/runController";
import rateLimit from "express-rate-limit";

const runLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 runs per minute per IP
  message: { error: "Too many code executions, try again in a minute" },
});

const router = Router();

router.post("/", runLimiter, runCode);

export default router;
