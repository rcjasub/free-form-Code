import { describe, expect, it } from "vitest";
import { boxOf, clearOffset, PLACEMENT_GAP } from "./placement";
import { LINE_HEIGHT } from "./splitLines";
import type { RestorePayload } from "./restore";

const block = (over: Partial<RestorePayload>): RestorePayload => ({
  type: "code",
  content: "",
  x: 0,
  y: 0,
  width: 300,
  language: "javascript",
  link: null,
  wrapWidth: null,
  fontSize: null,
  ...over,
});

describe("boxOf", () => {
  it("makes a text block as tall as its lines", () => {
    const one = boxOf(block({ content: "a" }));
    const three = boxOf(block({ content: "a\nb\nc" }));
    expect(three.bottom - one.bottom).toBeCloseTo(2 * LINE_HEIGHT);
  });

  it("makes a drawing as tall as its lowest point", () => {
    const box = boxOf(block({ type: "draw", x: 10, y: 20, width: 50, content: JSON.stringify([{ x: 0, y: 0 }, { x: 50, y: 40 }]) }));
    expect(box).toEqual({ left: 10, top: 20, right: 60, bottom: 60 });
  });

  it("uses an image's measured height, or its width when unknown", () => {
    expect(boxOf(block({ type: "image", width: 200 }), 100).bottom).toBe(100);
    expect(boxOf(block({ type: "image", width: 200 })).bottom).toBe(200);
  });
});

describe("clearOffset", () => {
  const existing = [
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 400, top: 0, right: 500, bottom: 50 },
  ];

  it("leaves a group that lands on empty space where it is", () => {
    expect(clearOffset([{ left: 0, top: 200, right: 100, bottom: 300 }], existing)).toEqual({ dx: 0, dy: 0 });
  });

  it("moves a colliding group to the right of everything already there", () => {
    const incoming = [
      { left: 50, top: 50, right: 150, bottom: 150 },
      { left: 20, top: 400, right: 60, bottom: 450 },
    ];
    const { dx, dy } = clearOffset(incoming, existing);
    expect(dy).toBe(0);
    expect(20 + dx).toBe(500 + PLACEMENT_GAP); // the group's left edge
  });

  it("does nothing on an empty canvas", () => {
    expect(clearOffset([{ left: 0, top: 0, right: 10, bottom: 10 }], [])).toEqual({ dx: 0, dy: 0 });
  });
});
