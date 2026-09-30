import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import * as Users from "../models/users";
import * as Canvas from "../models/canvas";
import pool from "../db";
import { handleServerError } from "../utils/errors";
import { AuthRequest, TokenPayload } from "../middleware/auth";

function generateShareId(length = 12): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

const JWT_SECRET = process.env.JWT_SECRET!;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

export async function register(req: AuthRequest, res: Response): Promise<void> {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res
      .status(400)
      .json({ error: "username, email and password are required" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const password_hash = await bcrypt.hash(password, 10);

    // A guest signing up keeps their id, so the canvas they already made stays theirs.
    let user = req.user?.isGuest
      ? await Users.upgradeGuestUser(req.user.id, { username, email, password_hash }, client)
      : null;

    // Not a guest (or the guest row was already cleaned up): brand-new account.
    if (!user) {
      user = await Users.createUser(
        { username, email, password_hash },
        client,
      );
      await Canvas.create(
        {
          user_id: user.id,
          name: "My Canvas",
          share_id: generateShareId(),
          is_public: false,
        },
        client,
      );
    }
    await client.query("COMMIT");

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.cookie("token", token, COOKIE_OPTIONS);
    res
      .status(201)
      .json({
        user: { id: user.id, username: user.username, email: user.email },
      });
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Username or email already in use" });
      return;
    }
    handleServerError(res, err);
  } finally {
    client.release();
  }
}

export async function guest(_req: Request, res: Response): Promise<void> {
  const username = "guest_" + generateShareId(8);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await Users.createGuestUser(username, client);
    const canvas = await Canvas.create(
      { user_id: user.id, name: "My Canvas", share_id: generateShareId(), is_public: false },
      client,
    );
    await client.query("COMMIT");

    const token = jwt.sign(
      { id: user.id, username: user.username, isGuest: true },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    // Cookie must outlive the default 24h, or the browser drops the guest's only way back in.
    res.cookie("token", token, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.status(201).json({
      user: { id: user.id, username: user.username, isGuest: true },
      canvasId: canvas.id,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    handleServerError(res, err);
  } finally {
    client.release();
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
    // Guests have no password, so they can never log in this way.
    if (!user || !user.password_hash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.cookie("token", token, COOKIE_OPTIONS);
    res
      .status(200)
      .json({
        user: { id: user.id, username: user.username, email: user.email },
      });
  } catch (err) {
    handleServerError(res, err);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.token;
  if (!token) {
    res.status(200).json({ user: null });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    res
      .status(200)
      .json({
        user: {
          id: decoded.id,
          email: decoded.email,
          username: decoded.username,
          isGuest: decoded.isGuest ?? false,
        },
      });
  } catch {
    res.status(200).json({ user: null });
  }
}
