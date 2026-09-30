import pool from "../db";
import { Pool, PoolClient } from "pg";

export interface User {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  is_guest: boolean;
  created_at: string;
}

export interface CreateUserParams {
  username: string;
  email: string;
  password_hash: string;
}

export async function createUser(
  params: CreateUserParams,
  db: Pool | PoolClient = pool,
): Promise<User> {
  const { username, email, password_hash } = params;
  const result = await db.query<User>(
    "INSERT INTO users (username, email, password_hash) VALUES($1, $2, $3) RETURNING *",
    [username, email, password_hash],
  );
  return result.rows[0];
}

export async function createGuestUser(
  username: string,
  db: Pool | PoolClient = pool,
): Promise<User> {
  const result = await db.query<User>(
    "INSERT INTO users (username, is_guest) VALUES ($1, true) RETURNING *",
    [username],
  );
  return result.rows[0];
}

// Turns a guest into a real account in place, so their id — and every canvas
// pointing at it — carries over. Returns null if the row is gone or was
// already upgraded.
export async function upgradeGuestUser(
  id: string,
  params: CreateUserParams,
  db: Pool | PoolClient = pool,
): Promise<User | null> {
  const { username, email, password_hash } = params;
  const result = await db.query<User>(
    `UPDATE users
     SET username = $2, email = $3, password_hash = $4, is_guest = false
     WHERE id = $1 AND is_guest = true
     RETURNING *`,
    [id, username, email, password_hash],
  );
  return result.rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}
