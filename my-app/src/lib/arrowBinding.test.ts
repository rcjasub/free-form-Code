import { afterEach, describe, expect, it } from "vitest";
import { bindBox } from "./bindable";
import { clearLive, liveBox, liveKey, setLive, setLiveMany } from "./liveShapes";
import { DEFAULT_DRAW_STYLE, serializeDrawing } from "./points";
import { DEFAULT_SHAPE, DEFAULT_STYLE, anchorPoint, parseArrow, parseShape, serializeArrow, serializeShape } from "./shapes";
import { detectShapeKind } from "./shapeDetection";
import { snappedShapeBlock } from "../hooks/useShapeTool";

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 5);
  expect(p.y).toBeCloseTo(y, 5);
};

describe("live shape positions", () => {
  afterEach(() => clearLive(["a", "b", "c"]));

  it("change the key only for the shapes asked about", () => {
    const before = liveKey(["a"]);
    setLive("b", { x: 1, y: 2 });
    expect(liveKey(["a"])).toBe(before);
    setLive("a", { x: 5, y: 6 });
    expect(liveKey(["a"])).not.toBe(before);
  });

  it("are gone once cleared", () => {
    setLiveMany([["a", { x: 1, y: 1 }], ["c", { x: 2, y: 2, w: 10, h: 10 }]]);
    expect(liveBox("c")).toEqual({ x: 2, y: 2, w: 10, h: 10 });
    clearLive(["a", "c"]);
    expect(liveKey(["a", "c"])).toBe("");
  });
});

describe("what an arrow attaches to", () => {
  it("is a shape's box", () => {
    const content = serializeShape({ ...DEFAULT_SHAPE, kind: "ellipse", w: 100, h: 50 });
    expect(bindBox({ id: "s", type: "shape", x: 10, y: 20, content })).toEqual({ x: 10, y: 20, w: 100, h: 50, kind: "ellipse" });
  });

  it("is a snapped triangle's outline", () => {
    const tri = [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 50, y: 0 }];
    const box = bindBox({ id: "d", type: "draw", x: 200, y: 300, content: serializeDrawing(tri, DEFAULT_DRAW_STYLE) });
    expect(box).toMatchObject({ x: 200, y: 300, w: 100, h: 100 });
    expect(box?.outline?.[0]).toEqual({ x: 250, y: 300 });
  });

  it("isn't an open freehand line", () => {
    const line = [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 80, y: 0 }, { x: 120, y: 30 }];
    expect(bindBox({ id: "d", type: "draw", x: 0, y: 0, content: serializeDrawing(line, DEFAULT_DRAW_STYLE) })).toBeNull();
  });

  it("isn't text, an image or another arrow", () => {
    expect(bindBox({ id: "t", x: 0, y: 0, content: "hello" })).toBeNull();
    expect(bindBox({ id: "i", type: "image", x: 0, y: 0, content: "" })).toBeNull();
  });
});

describe("attaching to an outline", () => {
  // a triangle pointing up: apex (50, 0), base from (0, 100) to (100, 100)
  const tri = [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 50, y: 0 }];
  const box = { x: 0, y: 0, w: 100, h: 100, kind: "rect" as const, outline: tri };

  it("lands on the base when aimed straight down", () => {
    close(anchorPoint(box, { x: 50, y: 500 }), 50, 100);
  });

  it("lands on a slanted side, not the box's edge, when aimed sideways", () => {
    const p = anchorPoint(box, { x: 500, y: 50 });
    // the right side runs from (50, 0) to (100, 100): at y = 50 it's at x = 75
    close(p, 75, 50);
  });
});

describe("snapping a pen stroke", () => {
  const wobblyRect = () => {
    const pts = [];
    for (let x = 0; x <= 200; x += 10) pts.push({ x, y: (x % 20) / 10 });
    for (let y = 0; y <= 100; y += 10) pts.push({ x: 200 + (y % 20) / 10, y });
    for (let x = 200; x >= 0; x -= 10) pts.push({ x, y: 100 - (x % 20) / 10 });
    for (let y = 100; y >= 0; y -= 10) pts.push({ x: (y % 20) / 10, y });
    return pts;
  };

  it("says which shape it found", () => {
    expect(detectShapeKind(wobblyRect())?.kind).toBe("rect");
  });

  it("turns a snapped rectangle into a real shape block", () => {
    const snap = detectShapeKind(wobblyRect())!;
    const block = snappedShapeBlock("rect", snap.points, DEFAULT_STYLE)!;
    expect(block.type).toBe("shape");
    const shape = parseShape(block.content);
    expect(shape.kind).toBe("rect");
    // the box the stroke was drawn in, give or take its wobble
    expect([block.x, block.y]).toEqual([0, 0]);
    expect(Math.abs(shape.w - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(shape.h - 100)).toBeLessThanOrEqual(2);
  });
});

describe("an arrow's label", () => {
  it("keeps its text and size through saving and loading", () => {
    const arrow = parseArrow(serializeArrow({ ...parseArrow("{}"), label: "calls\nPOST /run", fontSize: 20 }));
    expect([arrow.label, arrow.fontSize]).toEqual(["calls\nPOST /run", 20]);
  });
});
