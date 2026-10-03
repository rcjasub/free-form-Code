import pool from "../db";

export interface Block {
  id: string;
  canvas_id: string;
  type: string;
  language: string;
  content: string;
  link: string | null;
  x: number;
  y: number;
  width: number;
  created_at: Date;
  updated_at: Date;
}

export interface createBlockParams {
  canvasId: string;
  type: string;
  content: string;
  x: number;
  y: number;
  width: number;
}

export async function getBlocksByCanvasId(canvasId: string): Promise<Block[]> {
  const result = await pool.query<Block>(
    "SELECT * FROM blocks WHERE canvas_id = $1 ORDER BY created_at ASC",
    [canvasId],
  );
  return result.rows; //unwrapping
}

export async function CreateBlock(params: createBlockParams): Promise<Block> {
  const { canvasId, type, content, x, y, width } = params;
  const result = await pool.query<Block>(
    `INSERT INTO blocks (canvas_id, type, content, x, y, width) 
     VALUES($1, $2, $3, $4, $5, $6)
     RETURNING *`, // returns the inserted row immediately
    [canvasId, type, content, x, y, width],
  );
  return result.rows[0];
}

// Every write below matches on canvas_id as well as id. The route middleware
// only checks access to the canvas in the URL — without this, someone with
// access to one canvas could modify a block on another canvas by its id.

export async function deleteBlock(canvasId: string, blockId: string): Promise<Block> {
  const result = await pool.query<Block>(
    `DELETE FROM blocks WHERE id = $1 AND canvas_id = $2 RETURNING *`,
    [blockId, canvasId],
  );
  return result.rows[0];
}

export async function updateBlockPosition(
  canvasId: string,
  blockId: string,
  x: number,
  y: number,
): Promise<Block> {
  const result = await pool.query<Block>(
    `UPDATE blocks SET x = $1, y = $2 WHERE id = $3 AND canvas_id = $4 RETURNING *`,
    [x, y, blockId, canvasId],
  );
  return result.rows[0];
}

export async function updateBlockContent(
  canvasId: string,
  blockId: string,
  content: string,
): Promise<Block> {
  const result = await pool.query<Block>(
    `UPDATE blocks SET content = $1 WHERE id = $2 AND canvas_id = $3 RETURNING *`,
    [content, blockId, canvasId],
  );
  return result.rows[0];
}

export async function updateBlockLanguage(
  canvasId: string,
  blockId: string,
  language: string,
): Promise<Block> {
  const result = await pool.query<Block>(
    `UPDATE blocks SET language = $1 WHERE id = $2 AND canvas_id = $3 RETURNING *`,
    [language, blockId, canvasId],
  );
  return result.rows[0];
}

export async function updateBlockLink(
  canvasId: string,
  blockId: string,
  link: string | null,
): Promise<Block> {
  const result = await pool.query<Block>(
    `UPDATE blocks SET link = $1 WHERE id = $2 AND canvas_id = $3 RETURNING *`,
    [link, blockId, canvasId],
  );
  return result.rows[0];
}
