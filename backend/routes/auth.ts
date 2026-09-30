import { Router } from "express";
import { register, login, logout, guest, me } from "../controllers/usersController";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate";
import { optionalAuthenticate } from "../middleware/auth";
import { registerSchema, loginSchema } from "../schemas/user.schema";

const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 10, // 10 attempts per 2 min per IP
  message: { error: "Too many attempts, try again in 2 minutes" },
});

const router = Router();

// optionalAuthenticate so register can see if the caller is a guest to upgrade.
router.post("/register", authLimiter, optionalAuthenticate, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/logout", logout);
router.post("/guest", authLimiter, guest);
router.get("/me", me);

export default router;
