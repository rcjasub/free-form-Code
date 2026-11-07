import { describe, expect, it } from "vitest";
import {
  anchorPoint,
  DEFAULT_ARROW,
  DEFAULT_SHAPE,
  parseArrow,
  parseShape,
  resolveArrow,
  serializeArrow,
  serializeShape,
  type ShapeBox,
} from "./shapes";

// a 100×50 box centered on (50, 25)
const box = (kind: ShapeBox["kind"]): ShapeBox => ({ x: 0, y: 0, w: 100, h: 50, kind });
const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x);
  expect(p.y).toBeCloseTo(y);
};

describe("parseShape", () => {
  it("round-trips through serializeShape", () => {
    const shape = { ...DEFAULT_SHAPE, kind: "ellipse" as const, w: 120, h: 60, fill: "#a5d8ff", label: "API", seed: 42,
      meta: { sectionId: "api", summary: "Express routes", files: ["backend/server.ts"] } };
    expect(parseShape(serializeShape(shape))).toEqual(shape);
  });

  it("falls back to the default on bad JSON or a non-object", () => {
    expect(parseShape("not json")).toEqual(DEFAULT_SHAPE);
    expect(parseShape("[1,2]")).toEqual(DEFAULT_SHAPE);
    expect(parseShape("null")).toEqual(DEFAULT_SHAPE);
  });

  it("replaces each bad field on its own", () => {
    const s = parseShape(JSON.stringify({ kind: "hexagon", w: -5, h: "big", label: 7, stroke: "#e03131" }));
    expect(s).toEqual({ ...DEFAULT_SHAPE, stroke: "#e03131" });
  });

  it("only accepts plain colors", () => {
    expect(parseShape(JSON.stringify({ fill: "url(#evil)" })).fill).toBe(DEFAULT_SHAPE.fill);
    expect(parseShape(JSON.stringify({ fill: "red; x" })).fill).toBe(DEFAULT_SHAPE.fill);
    expect(parseShape(JSON.stringify({ fill: "transparent" })).fill).toBe("transparent");
  });

  it("reads the old hachure fills as stripes", () => {
    expect(parseShape(JSON.stringify({ fill: "cyan", fillStyle: "hachure" })).fillStyle).toBe("stripes");
    expect(parseShape(JSON.stringify({ fill: "cyan", fillStyle: "cross-hatch" })).fillStyle).toBe("stripes");
  });

  it("reads the corners, keeping older shapes round", () => {
    expect(parseShape(JSON.stringify({ kind: "rect" })).edges).toBe("round");
    expect(parseShape(JSON.stringify({ kind: "rect", edges: "sharp" })).edges).toBe("sharp");
    expect(parseShape(JSON.stringify({ kind: "rect", edges: "wavy" })).edges).toBe("round");
  });

  it("drops meta without a section id", () => {
    expect(parseShape(JSON.stringify({ meta: { summary: "x" } })).meta).toBeUndefined();
  });
});

describe("parseArrow", () => {
  it("round-trips through serializeArrow", () => {
    const arrow = { ...DEFAULT_ARROW, points: [{ x: 0, y: 0 }, { x: 40, y: 30 }], fromId: "a", toId: "b", label: "calls", strokeStyle: "dashed" as const };
    expect(parseArrow(serializeArrow(arrow))).toEqual(arrow);
  });

  it("reads the old dashed flag as a dashed stroke", () => {
    expect(parseArrow(JSON.stringify({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], dashed: true })).strokeStyle).toBe("dashed");
  });

  it("clamps style numbers into range", () => {
    const a = parseArrow(JSON.stringify({ opacity: 400, strokeWidth: -3, roughness: 9 }));
    expect([a.opacity, a.strokeWidth, a.roughness]).toEqual([100, 0.5, 3]);
  });

  it("falls back to the default line with too few or broken points", () => {
    expect(parseArrow(JSON.stringify({ points: [{ x: 0, y: 0 }] })).points).toEqual(DEFAULT_ARROW.points);
    expect(parseArrow(JSON.stringify({ points: [{ x: 0, y: 0 }, { x: "1", y: 2 }] })).points).toEqual(DEFAULT_ARROW.points);
    expect(parseArrow("oops")).toEqual(DEFAULT_ARROW);
  });
});

describe("anchorPoint", () => {
  it("rect: hits the side the line leaves through", () => {
    close(anchorPoint(box("rect"), { x: 500, y: 25 }), 100, 25); // straight right
    close(anchorPoint(box("rect"), { x: 50, y: -100 }), 50, 0); // straight up
    close(anchorPoint(box("rect"), { x: 150, y: 125 }), 75, 50); // diagonal: bottom edge first
  });

  it("ellipse: lands on the curve", () => {
    close(anchorPoint(box("ellipse"), { x: 500, y: 25 }), 100, 25);
    const p = anchorPoint(box("ellipse"), { x: 150, y: 125 });
    expect(((p.x - 50) / 50) ** 2 + ((p.y - 25) / 25) ** 2).toBeCloseTo(1);
  });

  it("diamond: lands on an edge between two tips", () => {
    close(anchorPoint(box("diamond"), { x: 500, y: 25 }), 100, 25); // the right tip
    const p = anchorPoint(box("diamond"), { x: 150, y: 125 });
    expect(Math.abs(p.x - 50) / 50 + Math.abs(p.y - 25) / 25).toBeCloseTo(1);
  });

  it("works when the target is inside the shape", () => {
    close(anchorPoint(box("rect"), { x: 60, y: 25 }), 100, 25);
  });

  it("returns the center when there's no direction", () => {
    close(anchorPoint(box("rect"), { x: 50, y: 25 }), 50, 25);
  });
});

describe("resolveArrow", () => {
  const shapes = new Map<string, ShapeBox>([
    ["a", { x: 0, y: 0, w: 100, h: 50, kind: "rect" }], // center (50, 25)
    ["b", { x: 300, y: 0, w: 100, h: 50, kind: "rect" }], // center (350, 25)
  ]);
  const arrow = (over: object) => ({ ...DEFAULT_ARROW, points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], ...over });

  it("leaves an unattached arrow alone", () => {
    const a = arrow({});
    expect(resolveArrow(a, 50, 25, shapes)).toBe(a);
  });

  it("puts both attached ends on the facing borders, relative to x/y", () => {
    const r = resolveArrow(arrow({ fromId: "a", toId: "b" }), 50, 25, shapes);
    close(r.points[0], 50, 0); // (100, 25) on a's right side
    close(r.points[1], 250, 0); // (300, 25) on b's left side
  });

  it("follows a shape that moved", () => {
    const moved = new Map(shapes).set("b", { x: 0, y: 300, w: 100, h: 50, kind: "rect" }); // now below a
    const r = resolveArrow(arrow({ fromId: "a", toId: "b" }), 0, 0, moved);
    close(r.points[0], 50, 50); // a's bottom
    close(r.points[1], 50, 300); // b's top
  });

  it("aims a single attached end at the free end", () => {
    const r = resolveArrow(arrow({ fromId: "a" }), 50, 25, shapes);
    close(r.points[0], 50, 0);
    close(r.points[1], 300, 0); // free end untouched
  });

  it("keeps the drawn end when its shape is gone", () => {
    const r = resolveArrow(arrow({ fromId: "a", toId: "deleted" }), 50, 25, shapes);
    close(r.points[1], 300, 0);
  });
});
