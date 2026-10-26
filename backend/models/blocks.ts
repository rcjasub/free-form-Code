import pool from "../db";

export interface Block {
  id: string;
  canvas_id: string;
  type: string;
  language: string;
  content: string;
  link: string | null;
  wrap_width: number | null;
  font_size: number | null;
  x: number;
  y: number;
  width: number;
  client_id: string | null;
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

export interface CanvasUsage {
  count: number;
  chars: number;
}

// How many blocks a canvas holds and how much content they add up to, for the
// per-canvas quota. `excludeBlockId` leaves one block out of the total, so an
// edit can be checked as "everything else + the block's new content".
// id::text so a malformed block id just matches nothing instead of erroring.
export async function getCanvasUsage(canvasId: string, excludeBlockId?: string): Promise<CanvasUsage> {
  const result = await pool.query<{ count: number; chars: string }>(
    `SELECT count(*)::int AS count, coalesce(sum(length(content)), 0) AS chars
     FROM blocks WHERE canvas_id = $1 AND id::text IS DISTINCT FROM $2`,
    [canvasId, excludeBlockId ?? null],
  );
  // sum() of int is bigint, which pg returns as a string
  return { count: result.rows[0].count, chars: Number(result.rows[0].chars) };
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

export interface RestoreBlockParams {
  type: string;
  content: string;
  x: number;
  y: number;
  width: number;
  language: string;
  link: string | null;
  wrapWidth: number | null;
  fontSize: number | null;
  clientId?: string;
}

// Which of these browser ids this canvas already has a block for.
export async function existingClientIds(canvasId: string, clientIds: string[]): Promise<Set<string>> {
  if (clientIds.length === 0) return new Set();
  const result = await pool.query<{ client_id: string }>(
    "SELECT client_id FROM blocks WHERE canvas_id = $1 AND client_id = ANY($2)",
    [canvasId, clientIds],
  );
  return new Set(result.rows.map((r) => r.client_id));
}

// Inserts several blocks in one transaction: all of them, or none if any
// insert fails. Returns the rows in the order given. A block whose clientId
// is already on the canvas isn't added again; its existing row is returned.
export async function restoreBlocks(canvasId: string, blocks: RestoreBlockParams[]): Promise<Block[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows: Block[] = [];
    for (const b of blocks) {
      const result = await client.query<Block>(
        `INSERT INTO blocks (canvas_id, type, content, x, y, width, language, link, wrap_width, font_size, client_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (canvas_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
         RETURNING *`,
        [canvasId, b.type, b.content, b.x, b.y, b.width, b.language, b.link, b.wrapWidth, b.fontSize, b.clientId ?? null],
      );
      const row =
        result.rows[0] ??
        (
          await client.query<Block>("SELECT * FROM blocks WHERE canvas_id = $1 AND client_id = $2", [
            canvasId,
            b.clientId,
          ])
        ).rows[0];
      rows.push(row);
    }
    await client.query("COMMIT");
    return rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface BlockSize {
  wrapWidth?: number | null;
  fontSize?: number | null;
}

// Updates only the size fields that were sent; the column names come from
// this fixed list, never from the request.
export async function updateBlockSize(
  canvasId: string,
  blockId: string,
  size: BlockSize,
): Promise<Block> {
  const sets: string[] = [];
  const values: (number | null)[] = [];
  if (size.wrapWidth !== undefined) {
    values.push(size.wrapWidth);
    sets.push(`wrap_width = $${values.length}`);
  }
  if (size.fontSize !== undefined) {
    values.push(size.fontSize);
    sets.push(`font_size = $${values.length}`);
  }
  const result = await pool.query<Block>(
    `UPDATE blocks SET ${sets.join(", ")} WHERE id = $${values.length + 1} AND canvas_id = $${values.length + 2} RETURNING *`,
    [...values, blockId, canvasId],
  );
  return result.rows[0];
}
