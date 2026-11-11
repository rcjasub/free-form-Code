import { describe, expect, it } from "vitest";
import { scaleNode } from "./groupScale";
import { DEFAULT_SHAPE, LABEL_PAD, heightForLabel, labelBox, parseShape, serializeShape, shapeLabelSize } from "./shapes";

const contentOf = (r: ReturnType<typeof scaleNode>) => parseShape((r as { content: string }).content);

describe("a shape's label", () => {
  it("keeps its text and size through saving and loading", () => {
    const shape = parseShape(serializeShape({ ...DEFAULT_SHAPE, label: "API\nserver", fontSize: 22 }));
    expect([shape.label, shape.fontSize]).toEqual(["API\nserver", 22]);
  });

  it("uses the default size when none is set, by line style", () => {
    expect(shapeLabelSize({ roughness: 0 })).toBe(14);
    expect(shapeLabelSize({ roughness: 1 })).toBe(16);
    expect(shapeLabelSize({ roughness: 0, fontSize: 30 })).toBe(30);
  });

  it("rejects a size that isn't a sensible number", () => {
    expect(parseShape(JSON.stringify({ ...DEFAULT_SHAPE, fontSize: "big" })).fontSize).toBeUndefined();
    expect(parseShape(JSON.stringify({ ...DEFAULT_SHAPE, fontSize: 9999 })).fontSize).toBe(200);
    expect(parseShape(JSON.stringify({ ...DEFAULT_SHAPE, fontSize: 1 })).fontSize).toBe(6);
  });

  it("sits inside an ellipse's and a diamond's outline, not just their box", () => {
    const rect = labelBox("rect", 200, 100);
    const ellipse = labelBox("ellipse", 200, 100);
    const diamond = labelBox("diamond", 200, 100);
    expect(rect).toEqual({ left: LABEL_PAD, top: LABEL_PAD, width: 200 - 2 * LABEL_PAD });
    expect(ellipse.width).toBeLessThan(rect.width);
    expect(diamond.width).toBeLessThan(ellipse.width);
    expect(diamond.width).toBe(100 - 2 * LABEL_PAD);
  });

  it("works out how tall a shape must be for its text to fit", () => {
    expect(heightForLabel("rect", 40)).toBe(40 + 2 * LABEL_PAD);
    // a diamond's text area is half its height
    expect(heightForLabel("diamond", 40)).toBe((40 + 2 * LABEL_PAD) * 2);
  });

  it("scales with the shape from a corner", () => {
    const content = serializeShape({ ...DEFAULT_SHAPE, label: "DB" });
    const shape = contentOf(scaleNode({ id: "s", type: "shape", x: 100, y: 100, content }, { x: 100, y: 100 }, 2));
    expect(shape.fontSize).toBe(28); // the default 14, doubled
  });

  it("keeps its size when the shape is only stretched one way", () => {
    const content = serializeShape({ ...DEFAULT_SHAPE, label: "DB", fontSize: 20 });
    const shape = contentOf(scaleNode({ id: "s", type: "shape", x: 100, y: 100, content }, { x: 100, y: 100 }, 2, 1));
    expect(shape.fontSize).toBe(20);
  });

  it("gets no size of its own from scaling when the shape has no text", () => {
    const content = serializeShape({ ...DEFAULT_SHAPE });
    const shape = contentOf(scaleNode({ id: "s", type: "shape", x: 100, y: 100, content }, { x: 100, y: 100 }, 2));
    expect(shape.fontSize).toBeUndefined();
  });
});
