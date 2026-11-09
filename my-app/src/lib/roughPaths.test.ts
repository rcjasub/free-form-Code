import { describe, expect, it } from "vitest";
import { shapeClipPath } from "./roughPaths";

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
