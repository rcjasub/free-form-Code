import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; username: string };
    req.user = decoded;
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
      req.user = jwt.verify(token, JWT_SECRET) as { id: string; email: string; username: string };
    } catch {
      // invalid/expired token — continue unauthenticated rather than reject
    }
  }
  next();
}
