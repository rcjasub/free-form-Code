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

  test("font clamps to its limits, and the wrap follows the clamped scale", () => {
    const r = resizeFrom("se", { ...START, font: 100, wrap: 200 }, 10000, LIMITS);
    expect(r.font).toBe(LIMITS.maxFont);
    expect(r.wrap).toBe(400); // 2x, the scale the font actually got
  });
});
