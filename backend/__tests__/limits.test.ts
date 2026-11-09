import { envInt } from "../utils/limits";

jest.mock("../models/canvas");
jest.mock("../redis", () => {
  const mock = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  return { __esModule: true, default: mock, ...mock };
});

describe("envInt", () => {
  test("reads a whole number", () => {
    expect(envInt("X", 5, { X: "12" })).toBe(12);
    expect(envInt("X", 5, { X: " 0 " })).toBe(0);
  });

  test("falls back when unset, empty or not a non-negative whole number", () => {
    expect(envInt("X", 5, {})).toBe(5);
    expect(envInt("X", 5, { X: "" })).toBe(5);
    expect(envInt("X", 5, { X: "ten" })).toBe(5);
    expect(envInt("X", 5, { X: "-3" })).toBe(5);
    expect(envInt("X", 5, { X: "2.5" })).toBe(5);
  });
});

// The limits are read once, when the module loads, so each case loads fresh
// copies with the environment it wants.
function loadWith(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  let mods!: {
    limits: typeof import("../utils/limits");
    controller: typeof import("../controllers/canvasController");
    Canvas: jest.Mocked<typeof import("../models/canvas")>;
  };
  jest.isolateModules(() => {
    mods = {
      limits: require("../utils/limits"),
      controller: require("../controllers/canvasController"),
      Canvas: require("../models/canvas"),
    };
  });
  process.env = saved;
  return mods;
}

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const owned = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) })) as never;

describe("defaults (nothing set: running it yourself)", () => {
  test("no canvas limit for accounts, 500 blocks and 50 MB per canvas", () => {
    const { limits } = loadWith({ MAX_CANVASES_PER_USER: undefined, MAX_BLOCKS_PER_CANVAS: undefined, MAX_CANVAS_CONTENT_MB: undefined });
    expect(limits.MAX_CANVASES_PER_USER).toBe(0);
    expect(limits.MAX_BLOCKS_PER_CANVAS).toBe(500);
    expect(limits.MAX_CANVAS_CONTENT).toBe(50_000_000);
  });

  test("an account can make a canvas however many it has", async () => {
    const { controller, Canvas } = loadWith({ MAX_CANVASES_PER_USER: undefined });
    Canvas.getByUserId.mockResolvedValue(owned(250));
    Canvas.create.mockResolvedValue({ id: "new" } as never);
    const r = res();
    await controller.createCanvas({ body: { name: "x" }, user: { id: "u1", isGuest: false } } as never, r as never);
    expect(r.status).toHaveBeenCalledWith(201);
  });
});

describe("with limits set (the demo VM)", () => {
  const env = { MAX_CANVASES_PER_USER: "10", MAX_BLOCKS_PER_CANVAS: "200", MAX_CANVAS_CONTENT_MB: "10" };

  test("reads them", () => {
    const { limits } = loadWith(env);
    expect(limits.MAX_CANVASES_PER_USER).toBe(10);
    expect(limits.MAX_BLOCKS_PER_CANVAS).toBe(200);
    expect(limits.MAX_CANVAS_CONTENT).toBe(10_000_000);
  });

  test("an account at the limit can't make another canvas", async () => {
    const { controller, Canvas } = loadWith(env);
    Canvas.getByUserId.mockResolvedValue(owned(10));
    const r = res();
    await controller.createCanvas({ body: { name: "x" }, user: { id: "u1", isGuest: false } } as never, r as never);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith({ error: expect.stringContaining("limit of 10 canvases") });
    expect(Canvas.create).not.toHaveBeenCalled();
  });

  test("an account under the limit can", async () => {
    const { controller, Canvas } = loadWith(env);
    Canvas.getByUserId.mockResolvedValue(owned(9));
    Canvas.create.mockResolvedValue({ id: "new" } as never);
    const r = res();
    await controller.createCanvas({ body: { name: "x" }, user: { id: "u1", isGuest: false } } as never, r as never);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  test("a guest still gets just one, whatever the account limit", async () => {
    const { controller, Canvas } = loadWith(env);
    Canvas.getByUserId.mockResolvedValue(owned(1));
    const r = res();
    await controller.createCanvas({ body: { name: "x" }, user: { id: "g1", isGuest: true } } as never, r as never);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith({ error: "Create an account to make more canvases" });
  });
});
