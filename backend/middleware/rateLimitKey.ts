import { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { AuthRequest } from "./auth";

// Rate-limit bucket for a request: the account when there is one (guests have a
// JWT too), so people behind one shared IP don't use up each other's limit;
// otherwise the IP. Must run after optionalAuthenticate, which sets req.user.
// ipKeyGenerator groups an IPv6 address by its /56, since one user can hold a
// whole IPv6 range and rotate through it.
export function userOrIpKey(req: Request): string {
  const userId = (req as AuthRequest).user?.id;
  return userId ? `user:${userId}` : ipKeyGenerator(req.ip ?? "");
}
