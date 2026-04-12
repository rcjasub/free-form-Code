import { Router } from "express";
import { register, login, logout, me } from "../controllers/usersController";
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min per IP
  message: { error: "Too many attempts, try again in 15 minutes" },
});

const router = Router();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.get("/me", me);

export default router;
