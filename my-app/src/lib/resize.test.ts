import { describe, expect, test } from "vitest";
import { resizeFrom, type ResizeStart } from "./resize";

const LIMITS = { minWidth: 40, maxWidth: 4000, minFont: 6, maxFont: 200 };
const START: ResizeStart = { width: 200, height: 40, x: 100, y: 50, font: null, defaultFont: 14, wrap: null };

describe("resizeFrom", () => {
  test("right edge sets the wrap width and keeps the position and font", () => {
    expect(resizeFrom("right", START, 80, LIMITS)).toEqual({ wrap: 280, font: null, x: 100, y: 50 });
  });

  test("left edge grows leftward: the right side stays put", () => {
    const r = resizeFrom("left", START, -50, LIMITS);
    expect(r.wrap).toBe(250);
    expect(r.x + r.wrap!).toBe(START.x + START.width);
  });

  test("a side dragged out to the text's one-line width or past it ends the wrap: the box fits the text", () => {
    const wrapped: ResizeStart = { ...START, wrap: 200, natural: 320 };
    // still narrower than the text: wraps there
    expect(resizeFrom("right", wrapped, 100, LIMITS).wrap).toBe(300);
    // out to it or past it: no wrap, no empty space
    expect(resizeFrom("right", wrapped, 120, LIMITS)).toEqual({ wrap: null, font: null, x: 100, y: 50 });
    expect(resizeFrom("right", wrapped, 600, LIMITS)).toEqual({ wrap: null, font: null, x: 100, y: 50 });
    // from the left: the right side stays put, the box as wide as the text
    const r = resizeFrom("left", wrapped, -600, LIMITS);
    expect(r.wrap).toBeNull();
    expect(r.x + 320).toBe(START.x + START.width);
    // one-line text dragged wider stays as it is
    expect(resizeFrom("right", { ...START, natural: 200 }, 150, LIMITS).wrap).toBeNull();
  });

  test("an edge can't go below the minimum width", () => {
    expect(resizeFrom("right", START, -500, LIMITS).wrap).toBe(LIMITS.minWidth);
  });

  test("a corner scales the font from the default, and the wrap with it", () => {
    const r = resizeFrom("se", { ...START, wrap: 200 }, 100, LIMITS); // 1.5x
    expect(r.font).toBe(21);
    expect(r.wrap).toBe(300);
    expect([r.x, r.y]).toEqual([100, 50]); // the top-left corner stays put
  });

  test("the top-left corner keeps the bottom-right corner in place", () => {
    const r = resizeFrom("nw", START, -100, LIMITS); // 1.5x
    expect(r.font).toBe(21);
    expect(r.x).toBe(START.x - START.width * 0.5);
    expect(r.y).toBe(START.y - START.height * 0.5);
  });

  test("the bottom edge scales by how far it moves down, keeping the top-left corner", () => {
    // 40 tall, dragged down 20: 1.5x
    expect(resizeFrom("bottom", { ...START, wrap: 200 }, 20, LIMITS)).toEqual({ wrap: 300, font: 21, x: 100, y: 50 });
    // dragged up 20: half the size
    expect(resizeFrom("bottom", START, -20, LIMITS).font).toBe(7);
  });

  test("the top edge scales by how far it moves up, keeping the bottom-right corner", () => {
    const r = resizeFrom("top", { ...START, wrap: 200 }, -20, LIMITS); // 1.5x
    expect(r.font).toBe(21);
    expect(r.wrap).toBe(300);
    expect(r.x).toBe(START.x - START.width * 0.5); // the right side stays put
    expect(r.y).toBe(START.y - START.height * 0.5); // and the bottom
  });

  test("font clamps to its limits, and the wrap follows the clamped scale", () => {
    const r = resizeFrom("se", { ...START, font: 100, wrap: 200 }, 10000, LIMITS);
    expect(r.font).toBe(LIMITS.maxFont);
    expect(r.wrap).toBe(400); // 2x, the scale the font actually got
  });
});
