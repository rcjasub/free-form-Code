import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as Users from "../models/users";

const JWT_SECRET = process.env.JWT_SECRET!;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

export async function register(req: Request, res: Response): Promise<void> {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email and password are required" });
    return;
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const user = await Users.createUser({ username, email, password_hash });
    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie("token", token, COOKIE_OPTIONS);
    res.status(201).json({ user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out successfully" });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  try {
    const user = await Users.findUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie("token", token, COOKIE_OPTIONS);
    res.status(200).json({ user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.token;
  if (!token) {
    res.status(200).json({ user: null });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; username: string };
    res.status(200).json({ user: { id: decoded.id, email: decoded.email, username: decoded.username } });
  } catch {
    res.status(200).json({ user: null });
  }
}
