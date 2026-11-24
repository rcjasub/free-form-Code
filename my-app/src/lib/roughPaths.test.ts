import { describe, expect, it } from "vitest";
import { roundedPath, shapeClipPath } from "./roughPaths";

describe("shapeClipPath", () => {
  it("rounds a rectangle's corners unless they're sharp", () => {
    expect(shapeClipPath("rect", 100, 50)).toContain("Q");
    expect(shapeClipPath("rect", 100, 50, "sharp")).toBe("M 0 0 L 100 0 L 100 50 L 0 50 Z");
  });

  it("rounds a diamond's corners unless they're sharp", () => {
    expect(shapeClipPath("diamond", 100, 50, "round")).toContain("Q");
    expect(shapeClipPath("diamond", 100, 50, "sharp")).toBe("M 50 0 L 100 25 L 50 50 L 0 25 Z");
  });

  it("an ellipse has no corners either way", () => {
    expect(shapeClipPath("ellipse", 100, 50, "sharp")).toBe(shapeClipPath("ellipse", 100, 50, "round"));
  });
});

describe("roundedPath", () => {
  it("turns each corner in a curve, smaller where a side is short", () => {
    // right 100, down 100, right 10
    const d = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 110, y: 100 }]);
    expect(d).toBe("M0 0L88 0Q100 0 100 12L100 95Q100 100 105 100L110 100");
  });

  it("leaves a straight line straight", () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 50, y: 0 }])).toBe("M0 0L50 0");
  });
});
