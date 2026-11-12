import pool from "../db";

// The model the AI drew a canvas's diagram from. Its shape (sections and
// edges) is validated before it's stored (architecture.schema.ts); here
// it's just a JSON object.
export type ArchitectureModel = Record<string, unknown>;

export interface Architecture {
  id: string;
  canvas_id: string;
  created_by: string | null;
  repo_url: string;
  commit_sha: string;
  model: ArchitectureModel;
  created_at: Date;
}

export interface CreateArchitectureParams {
  canvas_id: string;
  created_by: string | null;
  repo_url: string;
  commit_sha: string;
  model: ArchitectureModel;
}

// Regenerating a diagram adds a row. Only the newest few are kept: the
// latest is the one in use, and a couple more leave room to compare or go
// back, without a canvas regenerated all day piling up models.
export const KEEP_PER_CANVAS = 5;

export async function create(params: CreateArchitectureParams): Promise<Architecture> {
  const { canvas_id, created_by, repo_url, commit_sha, model } = params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<Architecture>(
      `INSERT INTO architectures (canvas_id, created_by, repo_url, commit_sha, model)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [canvas_id, created_by, repo_url, commit_sha, JSON.stringify(model)],
    );
    await client.query(
      `DELETE FROM architectures
       WHERE canvas_id = $1
         AND id NOT IN (
           SELECT id FROM architectures
           WHERE canvas_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2
         )`,
      [canvas_id, KEEP_PER_CANVAS],
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// The canvas's current architecture: the newest one, or null if its diagram
// was never generated.
export async function getLatest(canvasId: string): Promise<Architecture | null> {
  const result = await pool.query<Architecture>(
    `SELECT * FROM architectures
     WHERE canvas_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [canvasId],
  );
  return result.rows[0] ?? null;
}
