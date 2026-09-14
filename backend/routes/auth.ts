import { Router } from "express";
import { register, login, logout, me } from "../controllers/usersController";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema } from "../schemas/user.schema";

const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 10, // 10 attempts per 2 min per IP
  message: { error: "Too many attempts, try again in 2 minutes" },
});

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", me);

export default router;
