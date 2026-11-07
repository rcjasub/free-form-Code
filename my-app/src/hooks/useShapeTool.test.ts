import { describe, expect, it } from "vitest";
import { draftBox, isShapeTool, type ShapeDraft } from "./useShapeTool";

const draft = (over: Partial<ShapeDraft>): ShapeDraft => ({
  tool: "rect",
  from: { x: 100, y: 100 },
  to: { x: 100, y: 100 },
  square: false,
  ...over,
});

describe("draftBox", () => {
  it("makes a default-size shape centered on a plain click", () => {
    expect(draftBox(draft({ to: { x: 102, y: 101 } }))).toEqual({ x: 20, y: 60, w: 160, h: 80 });
  });

  it("uses the dragged box", () => {
    expect(draftBox(draft({ to: { x: 250, y: 160 } }))).toEqual({ x: 100, y: 100, w: 150, h: 60 });
  });

  it("handles dragging up and to the left", () => {
    expect(draftBox(draft({ to: { x: 40, y: 70 } }))).toEqual({ x: 40, y: 70, w: 60, h: 30 });
  });

  it("squares the box with Shift, growing away from the start", () => {
    expect(draftBox(draft({ to: { x: 40, y: 80 }, square: true }))).toEqual({ x: 40, y: 40, w: 60, h: 60 });
  });

  it("never goes below the minimum size", () => {
    expect(draftBox(draft({ to: { x: 300, y: 105 } })).h).toBe(16);
  });
});

describe("isShapeTool", () => {
  it("knows the diagram tools from the rest", () => {
    expect(isShapeTool("arrow")).toBe(true);
    expect(isShapeTool("draw")).toBe(false);
  });
});
