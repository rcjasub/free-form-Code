import pool from "../db";
import { Pool, PoolClient } from "pg";
import type { PreviewRow } from "../utils/canvasPreview";

export interface Canvas {
  id: string;
  user_id: string;
  name: string;
  share_id: string;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCanvasParams {
  user_id: string;
  name: string;
  share_id: string;
  is_public: boolean;
}

export async function create(
  params: CreateCanvasParams,
  db: Pool | PoolClient = pool,
): Promise<Canvas> {
  const { user_id, name, share_id, is_public } = params;
  const result = await db.query<Canvas>(
    `INSERT INTO canvases (user_id, name, share_id, is_public)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, name, share_id, is_public],
  );
  return result.rows[0];
}

export async function getById(canvasId: string): Promise<Canvas | null> {
  const result = await pool.query<Canvas>(
    `SELECT * FROM canvases WHERE id = $1`,
    [canvasId],
  );
  return result.rows[0] ?? null;
}

export async function getCanvasByShareId(id: string): Promise<Canvas | null> {
  const result = await pool.query<Canvas>(
    "SELECT * FROM canvases WHERE share_id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateCanvas(
  canvasId: string,
  fields: { name?: string; is_public?: boolean }
): Promise<Canvas | null> {
  const result = await pool.query<Canvas>(
    `UPDATE canvases
     SET name      = COALESCE($1, name),
         is_public = COALESCE($2, is_public),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [fields.name ?? null, fields.is_public ?? null, canvasId]
  );
  return result.rows[0] ?? null;
}

export async function getByUserId(userId: string): Promise<Canvas[]> {
  const result = await pool.query<Canvas>(
    `SELECT * FROM canvases WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

// What the dashboard's card sketches are drawn from: the newest `perCanvas`
// blocks of each of the user's canvases (returned oldest first, the order
// they're stacked in on the canvas), with only the numbers a sketch needs.
// Text and code send their line count and longest line instead of their
// content; drawings (and shapes) send their content, which holds their
// points (or size).
export async function getPreviewRows(userId: string, perCanvas: number): Promise<PreviewRow[]> {
  const result = await pool.query<PreviewRow>(
    `SELECT canvas_id, type, language, x, y, width, wrap_width, font_size,
            CASE WHEN type IN ('draw', 'shape') THEN content END AS content,
            CASE WHEN type IN ('text', 'code')
                 THEN (SELECT count(*)::int FROM regexp_split_to_table(content, chr(10))) END AS lines,
            CASE WHEN type IN ('text', 'code')
                 THEN (SELECT max(length(l))::int FROM regexp_split_to_table(content, chr(10)) AS l) END AS longest
     FROM (
       SELECT b.*, row_number() OVER (PARTITION BY b.canvas_id ORDER BY b.created_at DESC) AS n
       FROM blocks b
       JOIN canvases c ON c.id = b.canvas_id
       WHERE c.user_id = $1
     ) ranked
     WHERE n <= $2
     ORDER BY canvas_id, created_at`,
    [userId, perCanvas],
  );
  return result.rows;
}

export async function deleteCanvas(canvasId: string): Promise<Canvas> {
  const result = await pool.query<Canvas>(
    `DELETE FROM canvases WHERE id = $1 RETURNING *`,
    [canvasId],
  );
  return result.rows[0];
}

