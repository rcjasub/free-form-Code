import { buildPreviews, downsample, toPreviewItem, type PreviewRow } from "../utils/canvasPreview";
import { getCanvasPreviews } from "../controllers/canvasController";
import * as Canvas from "../models/canvas";

jest.mock("../models/canvas");
jest.mock("../redis", () => {
  const mock = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  return { __esModule: true, default: mock, ...mock };
});
const mockCanvas = Canvas as jest.Mocked<typeof Canvas>;

const row = (over: Partial<PreviewRow>): PreviewRow => ({
  canvas_id: "c1",
  type: "text",
  language: "text",
  x: 10.4,
  y: 20.6,
  width: null,
  wrap_width: null,
  font_size: null,
  lines: 1,
  longest: 10,
  content: null,
  ...over,
});

describe("toPreviewItem", () => {
  test("sizes a text block from its lines and longest line", () => {
    const item = toPreviewItem(row({ lines: 3, longest: 20 }));
    expect(item).toEqual({ t: "text", x: 10, y: 21, w: 168, h: 68 }); // 20 * 14 * 0.6, 3 * 14 * 1.625
  });

  test("a wrapped text block takes its wrap width and runs onto more lines", () => {
    const item = toPreviewItem(row({ lines: 1, longest: 100, wrap_width: 200 }));
    expect(item).toMatchObject({ t: "text", w: 200 });
    expect((item as { h: number }).h).toBeGreaterThan(14 * 1.625 * 4);
  });

  test("code is any language but plain text, and gets its padding", () => {
    expect(toPreviewItem(row({ type: "code", language: "python" }))).toMatchObject({ t: "code" });
    expect(toPreviewItem(row({ type: "text", language: "javascript" }))).toMatchObject({ t: "code" });
  });

  test("a drawing keeps its points, cut down to a few", () => {
    const points = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 2 }));
    const item = toPreviewItem(row({ type: "draw", content: JSON.stringify(points) }));
    expect(item?.t).toBe("draw");
    const pts = (item as { pts: [number, number][] }).pts;
    expect(pts.length).toBe(24);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([99, 198]);
  });

  test("reads a drawing saved as { points } too", () => {
    const item = toPreviewItem(row({ type: "draw", content: JSON.stringify({ points: [{ x: 1, y: 2 }], stroke: "red" }) }));
    expect(item).toEqual({ t: "draw", x: 10, y: 21, pts: [[1, 2]] });
  });

  test("skips a drawing it can't read", () => {
    expect(toPreviewItem(row({ type: "draw", content: "not json" }))).toBeNull();
    expect(toPreviewItem(row({ type: "draw", content: "[]" }))).toBeNull();
  });

  test("an image is a box at its width", () => {
    expect(toPreviewItem(row({ type: "image", width: 300 }))).toEqual({ t: "image", x: 10, y: 21, w: 300, h: 198 });
  });

  test("a diagram shape is a box at its size; anything else is left out", () => {
    expect(toPreviewItem(row({ type: "shape", content: JSON.stringify({ kind: "rect", w: 120, h: 60 }) }))).toMatchObject({
      t: "shape",
      w: 120,
      h: 60,
    });
    expect(toPreviewItem(row({ type: "arrow", content: "{}" }))).toBeNull();
  });
});

describe("downsample", () => {
  test("leaves short lists alone and keeps both ends of long ones", () => {
    expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const out = downsample(Array.from({ length: 50 }, (_, i) => i), 5);
    expect(out).toEqual([0, 12, 25, 37, 49]);
  });
});

describe("buildPreviews", () => {
  test("groups items by canvas", () => {
    const previews = buildPreviews([row({ canvas_id: "a" }), row({ canvas_id: "b" }), row({ canvas_id: "a", type: "image" })]);
    expect(Object.keys(previews).sort()).toEqual(["a", "b"]);
    expect(previews.a).toHaveLength(2);
  });
});

describe("getCanvasPreviews", () => {
  const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

  test("returns the user's canvas sketches", async () => {
    mockCanvas.getPreviewRows.mockResolvedValue([row({ canvas_id: "a" })]);
    const r = res();
    await getCanvasPreviews({ user: { id: "u1" } } as never, r as never);
    expect(mockCanvas.getPreviewRows).toHaveBeenCalledWith("u1", 100);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({ a: [expect.objectContaining({ t: "text" })] });
  });

  test("answers 500 when the query fails", async () => {
    mockCanvas.getPreviewRows.mockRejectedValue(new Error("db down"));
    const r = res();
    jest.spyOn(console, "error").mockImplementation(() => {});
    await getCanvasPreviews({ user: { id: "u1" } } as never, r as never);
    expect(r.status).toHaveBeenCalledWith(500);
  });
});
