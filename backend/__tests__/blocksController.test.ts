import {
  getAllBlocks,
  createBlock,
  deleteBlock,
  updateBlock,
  updateBlockContent,
  updateBlockLanguage,
  updateBlockLink,
  updateBlockSize,
  updateBlockStack,
  restoreBlocks,
  MAX_BLOCKS_PER_CANVAS,
  MAX_CANVAS_CONTENT,
} from "../controllers/blocksController";
import * as Blocks from "../models/blocks";
import { cacheGet, cacheSet, cacheDel } from "../redis";
import { updateBlockLinkSchema, updateBlockSizeSchema, updateBlockStackSchema, restoreBlocksSchema, MAX_RESTORE_BLOCKS } from "../schemas/block.schema";

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
  wrap_width: null,
  font_size: null,
  x: 0,
  y: 0,
  width: 10,
  client_id: null,
  z_index: 0,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  // an empty canvas unless a test says otherwise, so the quota check passes
  mockBlocks.getCanvasUsage.mockResolvedValue({ count: 0, chars: 0 });
  mockBlocks.existingClientIds.mockResolvedValue(new Set());
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

  test("returns 413 without creating when the canvas already has the max number of blocks", async () => {
    mockBlocks.getCanvasUsage.mockResolvedValue({ count: MAX_BLOCKS_PER_CANVAS, chars: 0 });

    await createBlock(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockBlocks.CreateBlock).not.toHaveBeenCalled();
  });

  describe("images", () => {
    const image = { type: "image", content: "data:image/webp;base64,AAAA", x: 0, y: 0, width: 480 };

    test.each([
      ["a guest", { id: "u1", username: "guest_x", isGuest: true }],
      ["someone with no account (a share-link visitor)", undefined],
    ])("returns 403 without creating for %s", async (_who, user) => {
      req = { ...req, user, body: image };

      await createBlock(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockBlocks.CreateBlock).not.toHaveBeenCalled();
    });

    test("creates it for a real account", async () => {
      req = { ...req, user: { id: "u1", username: "ana", isGuest: false }, body: image };
      mockBlocks.CreateBlock.mockResolvedValue(fakeBlock);

      await createBlock(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    test("guests can still create other blocks", async () => {
      req = { ...req, user: { id: "u1", username: "guest_x", isGuest: true } };
      mockBlocks.CreateBlock.mockResolvedValue(fakeBlock);

      await createBlock(req, res); // the default body is a drawing

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  test("returns 413 without creating when the new content would push the canvas over its size cap", async () => {
    mockBlocks.getCanvasUsage.mockResolvedValue({ count: 1, chars: MAX_CANVAS_CONTENT - 1 });

    await createBlock(req, res); // content "[]" is 2 chars

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockBlocks.CreateBlock).not.toHaveBeenCalled();
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

  test("checks the quota against every other block plus the new content", async () => {
    mockBlocks.getCanvasUsage.mockResolvedValue({ count: 3, chars: MAX_CANVAS_CONTENT - 5 });

    await updateBlockContent(req, res); // "console.log(1)" is 14 chars

    // the edited block's old content is left out of the total
    expect(mockBlocks.getCanvasUsage).toHaveBeenCalledWith("1", "b1");
    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockBlocks.updateBlockContent).not.toHaveBeenCalled();
  });

  test("allows an edit on a canvas that's at its block-count cap", async () => {
    mockBlocks.getCanvasUsage.mockResolvedValue({ count: MAX_BLOCKS_PER_CANVAS, chars: 0 });
    mockBlocks.updateBlockContent.mockResolvedValue(fakeBlock);

    await updateBlockContent(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
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

describe("updateBlockSize", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1", blockId: "b1" }, body: { wrapWidth: 320, fontSize: 20 } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("returns 200 and invalidates the cache on successful update", async () => {
    mockBlocks.updateBlockSize.mockResolvedValue({ ...fakeBlock, wrap_width: 320, font_size: 20 });

    await updateBlockSize(req, res);

    expect(mockBlocks.updateBlockSize).toHaveBeenCalledWith("1", "b1", { wrapWidth: 320, fontSize: 20 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 404 when the block doesn't exist", async () => {
    mockBlocks.updateBlockSize.mockResolvedValue(undefined as any);

    await updateBlockSize(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("updateBlockSizeSchema", () => {
  test("accepts a width, a font size, either alone, and null (reset)", () => {
    expect(updateBlockSizeSchema.safeParse({ wrapWidth: 480, fontSize: 18 }).success).toBe(true);
    expect(updateBlockSizeSchema.safeParse({ fontSize: 32 }).success).toBe(true);
    expect(updateBlockSizeSchema.safeParse({ wrapWidth: null }).success).toBe(true);
  });

  test("rejects an empty update and out-of-range sizes", () => {
    expect(updateBlockSizeSchema.safeParse({}).success).toBe(false);
    expect(updateBlockSizeSchema.safeParse({ wrapWidth: 5 }).success).toBe(false);
    expect(updateBlockSizeSchema.safeParse({ fontSize: 1000 }).success).toBe(false);
    expect(updateBlockSizeSchema.safeParse({ fontSize: "big" }).success).toBe(false);
  });
});

describe("restoreBlocks", () => {
  let req: any;
  let res: any;
  const block = { type: "code", content: "hi", x: 1, y: 2, width: 300, language: "text", link: null, wrapWidth: 480, fontSize: null };

  beforeEach(() => {
    req = { params: { id: "1" }, body: { blocks: [block, { ...block, content: "there" }] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("restores every block in one call and invalidates the cache", async () => {
    mockBlocks.restoreBlocks.mockResolvedValue([fakeBlock, fakeBlock]);

    await restoreBlocks(req, res);

    expect(mockBlocks.restoreBlocks).toHaveBeenCalledWith("1", req.body.blocks);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith([fakeBlock, fakeBlock]);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
  });

  test("returns 403 without restoring anything when a guest's blocks include an image", async () => {
    const image = { ...block, type: "image", content: "data:image/webp;base64,AAAA" };
    req = { ...req, user: { id: "u1", username: "guest_x", isGuest: true }, body: { blocks: [block, image] } };

    await restoreBlocks(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockBlocks.restoreBlocks).not.toHaveBeenCalled();
  });

  test("returns 413 without restoring when they'd push the canvas past its block cap", async () => {
    mockBlocks.getCanvasUsage.mockResolvedValue({ count: MAX_BLOCKS_PER_CANVAS - 1, chars: 0 });

    await restoreBlocks(req, res); // 2 blocks, room for 1

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockBlocks.restoreBlocks).not.toHaveBeenCalled();
  });

  test("returns 413 without restoring when their content would go over the size cap", async () => {
    mockBlocks.getCanvasUsage.mockResolvedValue({ count: 0, chars: MAX_CANVAS_CONTENT - 3 });

    await restoreBlocks(req, res); // "hi" + "there" = 7 chars

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockBlocks.restoreBlocks).not.toHaveBeenCalled();
  });

  test("doesn't count blocks already uploaded (same clientId) against the cap", async () => {
    req.body.blocks = [
      { ...block, clientId: "local-a" },
      { ...block, clientId: "local-b" },
    ];
    mockBlocks.getCanvasUsage.mockResolvedValue({ count: MAX_BLOCKS_PER_CANVAS - 1, chars: 0 });
    mockBlocks.existingClientIds.mockResolvedValue(new Set(["local-a"]));
    mockBlocks.restoreBlocks.mockResolvedValue([fakeBlock, fakeBlock]);

    await restoreBlocks(req, res); // only local-b is new, and there's room for 1

    expect(mockBlocks.existingClientIds).toHaveBeenCalledWith("1", ["local-a", "local-b"]);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("restoreBlocksSchema", () => {
  test("fills in what the single create route can't take", () => {
    const parsed = restoreBlocksSchema.parse({ blocks: [{ type: "code", content: "x", x: 0, y: 0 }] });
    expect(parsed.blocks[0]).toMatchObject({ language: "javascript", link: null, wrapWidth: null, fontSize: null, width: 300 });
  });

  test("rejects an empty list, too many blocks, and bad fields", () => {
    const one = { type: "code", content: "x", x: 0, y: 0 };
    expect(restoreBlocksSchema.safeParse({ blocks: [] }).success).toBe(false);
    expect(restoreBlocksSchema.safeParse({ blocks: Array(MAX_RESTORE_BLOCKS + 1).fill(one) }).success).toBe(false);
    expect(restoreBlocksSchema.safeParse({ blocks: [{ ...one, link: "javascript:alert(1)" }] }).success).toBe(false);
    expect(restoreBlocksSchema.safeParse({ blocks: [{ ...one, language: "ruby" }] }).success).toBe(false);
    expect(restoreBlocksSchema.safeParse({ blocks: [{ ...one, clientId: "x".repeat(65) }] }).success).toBe(false);
    expect(restoreBlocksSchema.safeParse({ blocks: [{ ...one, clientId: "local-1" }] }).success).toBe(true);
    expect(restoreBlocksSchema.safeParse({ blocks: [{ ...one, zIndex: 1.7e12 }] }).success).toBe(true);
    expect(restoreBlocksSchema.safeParse({ blocks: [{ ...one, zIndex: -1 }] }).success).toBe(false);
  });
});

describe("updateBlockStack", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1" }, body: { blocks: [{ id: "b1", zIndex: 5 }, { id: "b2", zIndex: 6 }] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("saves every position in one call and invalidates the cache", async () => {
    mockBlocks.updateBlockStack.mockResolvedValue([{ id: "b1", z_index: 5 }, { id: "b2", z_index: 6 }]);

    await updateBlockStack(req, res);

    expect(mockBlocks.updateBlockStack).toHaveBeenCalledWith("1", req.body.blocks);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: "b1", z_index: 5 }, { id: "b2", z_index: 6 }]);
  });

  test("leaves the cache alone when none of the blocks are on this canvas", async () => {
    mockBlocks.updateBlockStack.mockResolvedValue([]);

    await updateBlockStack(req, res);

    expect(mockCacheDel).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([]);
  });

  test("returns 500 when the database fails", async () => {
    mockBlocks.updateBlockStack.mockRejectedValue(new Error("db down"));

    await updateBlockStack(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("updateBlockStackSchema", () => {
  test("accepts positions from 0 up to creation-time scale", () => {
    expect(updateBlockStackSchema.safeParse({ blocks: [{ id: "b1", zIndex: 0 }, { id: "b2", zIndex: 1.7e12 + 1 }] }).success).toBe(true);
  });

  test("rejects an empty list, too many blocks, and bad positions", () => {
    expect(updateBlockStackSchema.safeParse({ blocks: [] }).success).toBe(false);
    expect(updateBlockStackSchema.safeParse({ blocks: Array(501).fill({ id: "b1", zIndex: 1 }) }).success).toBe(false);
    expect(updateBlockStackSchema.safeParse({ blocks: [{ id: "b1", zIndex: -1 }] }).success).toBe(false);
    expect(updateBlockStackSchema.safeParse({ blocks: [{ id: "b1", zIndex: 1e300 }] }).success).toBe(false);
    expect(updateBlockStackSchema.safeParse({ blocks: [{ id: "b1", zIndex: "top" }] }).success).toBe(false);
    expect(updateBlockStackSchema.safeParse({ blocks: [{ id: "", zIndex: 1 }] }).success).toBe(false);
  });
});
