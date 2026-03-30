import pool from "../db";

export interface Block {
  id: string;
  canvas_id: string;
  type: string;
  content: string;
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
    "SELECT * FROM blocks WHERE canvas_id = $1",
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

export async function deleteBlock(blockId: string): Promise<Block> {
  const result = await pool.query<Block>(
    `
    DELETE FROM blocks WHERE id = $1 RETURNING *`,
    [blockId],
  );
  return result.rows[0];
}

export async function updateBlockPosition(
  blockId: string,
  x: number,
  y: number,
): Promise<Block> {
  const result = await pool.query<Block>(
    `UPDATE blocks SET x = $1, y = $2 WHERE id = $3 RETURNING *`,
    [blockId, x, y],
  );
  return result.rows[0];
}
