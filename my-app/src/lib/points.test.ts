import { describe, expect, it } from "vitest";
import { DEFAULT_DRAW_STYLE, parseDrawing, parsePoints, serializeDrawing } from "./points";

const pts = [{ x: 0, y: 0 }, { x: 10, y: 5 }];

describe("drawing content", () => {
  it("reads the original bare points array with the default style", () => {
    expect(parseDrawing(JSON.stringify(pts))).toEqual({ points: pts, style: DEFAULT_DRAW_STYLE });
  });

  it("saves a default-styled drawing in the original form", () => {
    expect(serializeDrawing(pts, DEFAULT_DRAW_STYLE)).toBe(JSON.stringify(pts));
  });

  it("round-trips a styled drawing", () => {
    const style = { stroke: "#e03131", strokeWidth: 4, strokeStyle: "dashed" as const, opacity: 60 };
    const content = serializeDrawing(pts, style);
    expect(parseDrawing(content)).toEqual({ points: pts, style });
    expect(parsePoints(content)).toEqual(pts);
  });

  it("never throws on bad content, and checks each style field", () => {
    expect(parseDrawing("{nope").points).toBeNull();
    expect(parsePoints(JSON.stringify({ points: [{ x: 1 }] }))).toBeNull();
    const { style } = parseDrawing(JSON.stringify({ points: pts, stroke: "url(#x)", strokeWidth: 99, opacity: -5 }));
    expect(style).toEqual({ ...DEFAULT_DRAW_STYLE, strokeWidth: 20, opacity: 0 });
  });
});
