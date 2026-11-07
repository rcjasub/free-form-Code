import { describe, expect, it } from "vitest";
import { scaleFor, scaleNode, stretchFor } from "./groupScale";
import { DEFAULT_ARROW, DEFAULT_SHAPE, parseArrow, parseShape, serializeArrow, serializeShape } from "./shapes";

const anchor = { x: 100, y: 100 };

describe("scaleNode", () => {
  it("spreads positions out around the anchor", () => {
    const r = scaleNode({ id: "i", type: "image", x: 200, y: 150, content: "" }, anchor, 2);
    expect(r).toEqual({ kind: "move", id: "i", x: 300, y: 200 });
  });

  it("scales a shape's size, keeping its style", () => {
    const content = serializeShape({ ...DEFAULT_SHAPE, w: 100, h: 50, fill: "red" });
    const r = scaleNode({ id: "s", type: "shape", x: 100, y: 100, content }, anchor, 1.5);
    expect(r.kind).toBe("content");
    const shape = parseShape((r as { content: string }).content);
    expect([shape.w, shape.h, shape.fill]).toEqual([150, 75, "red"]);
  });

  it("never shrinks a shape to nothing", () => {
    const content = serializeShape({ ...DEFAULT_SHAPE, w: 20, h: 20 });
    const shape = parseShape((scaleNode({ id: "s", type: "shape", x: 0, y: 0, content }, anchor, 0.1) as { content: string }).content);
    expect(shape.w).toBeGreaterThanOrEqual(8);
  });

  it("scales a drawing's and an arrow's points", () => {
    const draw = scaleNode({ id: "d", type: "draw", x: 100, y: 100, content: JSON.stringify([{ x: 0, y: 0 }, { x: 10, y: 20 }]) }, anchor, 2);
    expect(JSON.parse((draw as { content: string }).content)).toEqual([{ x: 0, y: 0 }, { x: 20, y: 40 }]);
    const arrowContent = serializeArrow({ ...DEFAULT_ARROW, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] });
    const arrow = scaleNode({ id: "a", type: "arrow", x: 100, y: 100, content: arrowContent }, anchor, 0.5);
    expect(parseArrow((arrow as { content: string }).content).points).toEqual([{ x: 0, y: 0 }, { x: 25, y: 0 }]);
  });

  it("scales text by its font size and wrap width, within the allowed range", () => {
    expect(scaleNode({ id: "t", x: 100, y: 100, content: "hi", fontSize: null, wrapWidth: 200 }, anchor, 2)).toMatchObject({
      kind: "text",
      fontSize: 28,
      wrapWidth: 400,
    });
    expect(scaleNode({ id: "t", x: 100, y: 100, content: "hi", fontSize: 10, wrapWidth: null }, anchor, 0.1)).toMatchObject({
      fontSize: 6,
      wrapWidth: null,
    });
  });
});

describe("stretching one way", () => {
  it("stretches shapes and points along one axis only", () => {
    const content = serializeShape({ ...DEFAULT_SHAPE, w: 100, h: 50 });
    const r = scaleNode({ id: "s", type: "shape", x: 200, y: 200, content }, anchor, 2, 1);
    expect(r).toMatchObject({ x: 300, y: 200 });
    const shape = parseShape((r as { content: string }).content);
    expect([shape.w, shape.h]).toEqual([200, 50]);
  });

  it("only moves text, keeping its size", () => {
    expect(scaleNode({ id: "t", x: 200, y: 200, content: "hi", fontSize: 20, wrapWidth: 300 }, anchor, 1, 3)).toEqual({
      kind: "text",
      id: "t",
      x: 200,
      y: 400,
      wrapWidth: 300,
      fontSize: 20,
    });
  });

  it("stretchFor is the side's distance from the anchor, relative to where it started", () => {
    expect(stretchFor(0, 100, 250)).toBe(2.5);
    expect(stretchFor(100, 0, -100)).toBe(2); // the left side dragged further left
    expect(stretchFor(0, 100, -20)).toBe(0.1);
  });
});

describe("scaleFor", () => {
  it("is how far along the diagonal the corner was dragged", () => {
    expect(scaleFor({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 200 })).toBe(2);
    expect(scaleFor({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 50 })).toBe(0.5);
  });

  it("ignores sideways wobble and never goes below the minimum", () => {
    expect(scaleFor({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 40 })).toBe(1.5);
    expect(scaleFor({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: -50, y: -50 })).toBe(0.1);
  });
});
