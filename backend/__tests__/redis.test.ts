// Redis here is only a cache — these tests exist to lock in the guarantee
// that cacheGet/cacheSet/cacheDel never throw or reject, even when the
// underlying Redis client does (e.g. Redis is down or a command times out).
// That guarantee is what lets blocksController fall back to Postgres
// instead of failing (or hanging) a request when Redis is unreachable.

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
  }));
});

import redisClient, { cacheGet, cacheSet, cacheDel } from "../redis";

const mockGet = redisClient.get as jest.Mock;
const mockSet = redisClient.set as jest.Mock;
const mockDel = redisClient.del as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("cacheGet", () => {
  test("returns the value when redis responds", async () => {
    mockGet.mockResolvedValue("cached-value");
    await expect(cacheGet("key")).resolves.toBe("cached-value");
  });

  test("resolves null instead of throwing when redis is unreachable", async () => {
    mockGet.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(cacheGet("key")).resolves.toBeNull();
  });
});

describe("cacheSet", () => {
  test("resolves without throwing when redis is unreachable", async () => {
    mockSet.mockRejectedValue(new Error("Command timed out"));
    await expect(cacheSet("key", "value")).resolves.toBeUndefined();
  });
});

describe("cacheDel", () => {
  test("resolves without throwing when redis is unreachable", async () => {
    mockDel.mockRejectedValue(new Error("Command timed out"));
    await expect(cacheDel("key")).resolves.toBeUndefined();
  });
});
