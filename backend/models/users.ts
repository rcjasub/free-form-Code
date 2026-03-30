import pool from "../db";

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface CreateUserParams {
  username: string;
  email: string;
  password_hash: string;
}

export async function createUser(params: CreateUserParams): Promise<User> {
  const { username, email, password_hash } = params;
  const result = await pool.query<User>(
    "INSERT INTO users (username, email, password_hash) VALUES($1, $2, $3) RETURNING *",
    [username, email, password_hash],
  );
  return result.rows[0];
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}
