import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
  updateBlockContent,
  updateBlockLanguage,
  updateBlockLink,
} from "../controllers/blocksController";
import * as Blocks from "../models/blocks";
import { cacheGet, cacheSet, cacheDel } from "../redis";
import { updateBlockLinkSchema } from "../schemas/block.schema";

jest.mock("../models/blocks");
jest.mock("../redis", () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
}));

const mockBlocks = Blocks as jest.Mocked<typeof Blocks>;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

const fakeBlock = {
  id: "b1",
  canvas_id: "1",
  type: "draw",
  language: "javascript",
  content: "[]",
  link: null,
  x: 0,
  y: 0,
  width: 10,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getAllBlocks", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1" } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns cached blocks without touching the DB on a cache hit", async () => {
    mockCacheGet.mockResolvedValue(JSON.stringify([fakeBlock]));

    await getAllBlocks(req, res);

    expect(mockBlocks.getBlocksByCanvasId).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    // the cached value round-trips through JSON, so dates come back as strings
    expect(res.json).toHaveBeenCalledWith(JSON.parse(JSON.stringify([fakeBlock])));
  });

  // cacheGet's own contract (see redis.test.ts) is to resolve null rather
  // than throw when Redis is unreachable — from this controller's point of
  // view, a dead Redis and a genuine cache miss look identical. This test
  // is what actually verifies the bug is fixed: the request still succeeds
  // by reading Postgres directly instead of hanging or failing.
  test("falls back to the DB when the cache misses (including when redis is down)", async () => {
    mockCacheGet.mockResolvedValue(null);
    mockBlocks.getBlocksByCanvasId.mockResolvedValue([fakeBlock]);

    await getAllBlocks(req, res);

    expect(mockBlocks.getBlocksByCanvasId).toHaveBeenCalledWith("1");
    expect(mockCacheSet).toHaveBeenCalledWith("blocks:1", JSON.stringify([fakeBlock]));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([fakeBlock]);
  });

  test("returns 500 on a real database error", async () => {
    mockCacheGet.mockResolvedValue(null);
    mockBlocks.getBlocksByCanvasId.mockRejectedValue(new Error("db error"));

    await getAllBlocks(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });
});

describe("createBlock", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1" }, body: { type: "draw", content: "[]", x: 0, y: 0, width: 10 } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns 201 and the created block, then invalidates the cache", async () => {
    mockBlocks.CreateBlock.mockResolvedValue(fakeBlock);

    await createBlock(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(fakeBlock);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 500 on a real database error", async () => {
    mockBlocks.CreateBlock.mockRejectedValue(new Error("db error"));

    await createBlock(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });
});

describe("deleteBlock", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1", blockId: "b1" } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns 200 and invalidates the cache on successful delete", async () => {
    mockBlocks.deleteBlock.mockResolvedValue(fakeBlock);

    await deleteBlock(req, res);

    // canvas id from the URL must scope the query, not just the block id
    expect(mockBlocks.deleteBlock).toHaveBeenCalledWith("1", "b1");

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 404 when the block doesn't exist", async () => {
    mockBlocks.deleteBlock.mockResolvedValue(undefined as any);

    await deleteBlock(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockCacheDel).not.toHaveBeenCalled();
  });
});

describe("updateBlock", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1", blockId: "b1" }, body: { x: 5, y: 5 } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns 200 and invalidates the cache on successful move", async () => {
    mockBlocks.updateBlockPosition.mockResolvedValue(fakeBlock);

    await updateBlock(req, res);

    // canvas id from the URL must scope the query, not just the block id
    expect(mockBlocks.updateBlockPosition).toHaveBeenCalledWith("1", "b1", 5, 5);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 404 when the block doesn't exist", async () => {
    mockBlocks.updateBlockPosition.mockResolvedValue(undefined as any);

    await updateBlock(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("updateBlockContent", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1", blockId: "b1" }, body: { content: "console.log(1)" } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns 200 and invalidates the cache on successful update", async () => {
    mockBlocks.updateBlockContent.mockResolvedValue(fakeBlock);

    await updateBlockContent(req, res);

    // canvas id from the URL must scope the query, not just the block id
    expect(mockBlocks.updateBlockContent).toHaveBeenCalledWith("1", "b1", "console.log(1)");

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 404 when the block doesn't exist", async () => {
    mockBlocks.updateBlockContent.mockResolvedValue(undefined as any);

    await updateBlockContent(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("updateBlockLanguage", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1", blockId: "b1" }, body: { language: "python" } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns 200 and invalidates the cache on successful update", async () => {
    mockBlocks.updateBlockLanguage.mockResolvedValue({ ...fakeBlock, language: "python" });

    await updateBlockLanguage(req, res);

    expect(mockBlocks.updateBlockLanguage).toHaveBeenCalledWith("1", "b1", "python");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 404 when the block doesn't exist", async () => {
    mockBlocks.updateBlockLanguage.mockResolvedValue(undefined as any);

    await updateBlockLanguage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("updateBlockLink", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1", blockId: "b1" }, body: { link: "https://example.com" } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns 200 and invalidates the cache on successful update", async () => {
    mockBlocks.updateBlockLink.mockResolvedValue({ ...fakeBlock, link: "https://example.com" });

    await updateBlockLink(req, res);

    expect(mockBlocks.updateBlockLink).toHaveBeenCalledWith("1", "b1", "https://example.com");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 404 when the block doesn't exist", async () => {
    mockBlocks.updateBlockLink.mockResolvedValue(undefined as any);

    await updateBlockLink(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("updateBlockLinkSchema", () => {
  test("accepts http(s) links and null (removes the link)", () => {
    expect(updateBlockLinkSchema.safeParse({ link: "https://example.com/a?b=1" }).success).toBe(true);
    expect(updateBlockLinkSchema.safeParse({ link: "http://localhost:3000" }).success).toBe(true);
    expect(updateBlockLinkSchema.safeParse({ link: null }).success).toBe(true);
  });

  // the link becomes an <a href> for everyone on the canvas
  test("rejects links that could run code or aren't web pages", () => {
    expect(updateBlockLinkSchema.safeParse({ link: "javascript:alert(1)" }).success).toBe(false);
    expect(updateBlockLinkSchema.safeParse({ link: "data:text/html,<script>alert(1)</script>" }).success).toBe(false);
    expect(updateBlockLinkSchema.safeParse({ link: "not a url" }).success).toBe(false);
  });
});
