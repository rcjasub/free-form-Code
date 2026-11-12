import { Router } from "express";
import { register, login, logout, guest, me, deleteAccount } from "../controllers/usersController";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate";
import { authenticate, optionalAuthenticate } from "../middleware/auth";
import { registerSchema, loginSchema, deleteAccountSchema } from "../schemas/user.schema";

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
// Deleting an account checks its password, so it shares the login limiter:
// it can't be used to try passwords any faster than signing in.
router.delete("/me", authLimiter, authenticate, validate(deleteAccountSchema), deleteAccount);

export default router;
