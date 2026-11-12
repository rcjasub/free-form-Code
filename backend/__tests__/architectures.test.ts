// The architectures model (Phase 2, step 2). The SQL itself (constraints,
// cascades, pruning) was checked against a real Postgres; these pin down the
// transaction handling: insert and prune together or not at all, and the
// connection always goes back to the pool.

const client = { query: jest.fn(), release: jest.fn() };
jest.mock("../db", () => ({
  __esModule: true,
  default: { connect: jest.fn(async () => client), query: jest.fn() },
}));

import pool from "../db";
import * as Architectures from "../models/architectures";

const poolQuery = pool.query as jest.Mock;
const params = {
  canvas_id: "canvas-1",
  created_by: "user-1",
  repo_url: "https://github.com/owner/repo",
  commit_sha: "a".repeat(40),
  model: { sections: [{ id: "api" }], edges: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  client.query.mockImplementation(async (sql: string) =>
    sql.startsWith("INSERT") ? { rows: [{ id: "arch-1", ...params }] } : { rows: [] },
  );
});

const statements = () => client.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0]);

test("create inserts and prunes in one transaction", async () => {
  const row = await Architectures.create(params);

  expect(row.id).toBe("arch-1");
  expect(statements()).toEqual(["BEGIN", "INSERT", "DELETE", "COMMIT"]);
  // The model is stored as JSON text, and pruning keeps the newest few.
  expect(client.query.mock.calls[1][1]).toEqual([params.canvas_id, params.created_by, params.repo_url, params.commit_sha, JSON.stringify(params.model)]);
  expect(client.query.mock.calls[2][1]).toEqual([params.canvas_id, Architectures.KEEP_PER_CANVAS]);
  expect(client.release).toHaveBeenCalledTimes(1);
});

test("a failed insert rolls back, releases the connection and rethrows", async () => {
  client.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("INSERT")) throw new Error("violates check constraint");
    return { rows: [] };
  });

  await expect(Architectures.create(params)).rejects.toThrow("violates check constraint");
  expect(statements()).toEqual(["BEGIN", "INSERT", "ROLLBACK"]);
  expect(client.release).toHaveBeenCalledTimes(1);
});

test("getLatest returns the newest, or null when there's none", async () => {
  poolQuery.mockResolvedValueOnce({ rows: [{ id: "arch-2" }] });
  await expect(Architectures.getLatest("canvas-1")).resolves.toEqual({ id: "arch-2" });
  expect(poolQuery.mock.calls[0][0]).toMatch(/ORDER BY created_at DESC, id DESC\s+LIMIT 1/);

  poolQuery.mockResolvedValueOnce({ rows: [] });
  await expect(Architectures.getLatest("canvas-1")).resolves.toBeNull();
});
