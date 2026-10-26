import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { touchGuest } from "../models/users";

const JWT_SECRET = process.env.JWT_SECRET!;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

// Guests idle this long are deleted (cleanup.ts), and their cookie lasts as
// long — renewed while they keep using the app.
export const GUEST_TTL_DAYS = 15;

export function setGuestCookie(res: Response, user: { id: string; username: string }): void {
  const token = jwt.sign({ id: user.id, username: user.username, isGuest: true }, JWT_SECRET, {
    expiresIn: `${GUEST_TTL_DAYS}d`,
  });
  res.cookie("token", token, { ...COOKIE_OPTIONS, maxAge: GUEST_TTL_DAYS * 24 * 60 * 60 * 1000 });
}

// Keeps an active guest from being cleaned up: at most once an hour per guest
// (per server process), pushes back their last_active_at and renews their
// cookie. The write isn't awaited — a failed one only costs an hour.
const HOUR = 60 * 60 * 1000;
const lastSeen = new Map<string, number>();

function keepGuestAlive(user: TokenPayload, res: Response): void {
  if (!user.isGuest) return;
  const now = Date.now();
  if (now - (lastSeen.get(user.id) ?? 0) < HOUR) return;
  if (lastSeen.size > 10_000) lastSeen.clear();
  lastSeen.set(user.id, now);
  setGuestCookie(res, user);
  touchGuest(user.id).catch((err) => console.error("[auth] touchGuest failed:", err));
}

// What's inside our JWT. Guests have no email and have isGuest: true.
export interface TokenPayload {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = decoded;
    keepGuestAlive(decoded, res);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Like authenticate, but never rejects the request — a missing or invalid
// token just leaves req.user unset. Routes guarded by this rely on
// requireCanvasAccess (or equivalent) to decide what an unauthenticated
// caller is allowed to do, the same way the socket layer falls back to a
// guest identity instead of refusing the connection.
export function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as TokenPayload;
      keepGuestAlive(req.user, res);
    } catch {
      // invalid/expired token — continue unauthenticated rather than reject
    }
  }
  next();
}
