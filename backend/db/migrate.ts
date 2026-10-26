import fs from "fs";
import path from "path";
import pool from "./index";

// Brings the database up to date on startup by running schema.sql, which is
// written to be safe to re-run (IF NOT EXISTS everywhere). Deploys then can't
// ship code that expects a column the database doesn't have yet.
//
// An advisory lock keeps two servers starting at once from running it
// side by side.
const LOCK_ID = 726_001;

function schemaPath(): string {
  // next to this file under ts-node; the Docker image copies it next to the
  // compiled file too, and a local `npm run build` leaves it in db/
  const candidates = [path.join(__dirname, "schema.sql"), path.join(__dirname, "../../db/schema.sql")];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`schema.sql not found (looked in ${candidates.join(", ")})`);
  return found;
}

export async function runMigrations(): Promise<void> {
  const sql = fs.readFileSync(schemaPath(), "utf8");
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(sql);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}
