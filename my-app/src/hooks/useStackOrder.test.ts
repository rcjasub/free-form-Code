import { describe, it, expect } from "vitest";
import { raise, stackDepths } from "./useStackOrder";
import type { CanvasNode } from "./useCanvasHistory";

const node = (id: string, zIndex?: number): CanvasNode => ({ id, x: 0, y: 0, content: "", zIndex });
const bottomToTop = (nodes: CanvasNode[]) =>
  [...stackDepths(nodes).entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

describe("stackDepths", () => {
  it("orders by stored position", () => {
    expect(bottomToTop([node("a", 30), node("b", 10), node("c", 20)])).toEqual(["b", "c", "a"]);
  });

  it("keeps array order for ties and blocks with no position", () => {
    expect(bottomToTop([node("a", 0), node("b"), node("c", 0)])).toEqual(["a", "b", "c"]);
  });

  it("puts blocks from before stacking existed (0) under newer ones", () => {
    expect(bottomToTop([node("new", 1.7e12), node("old", 0)])).toEqual(["old", "new"]);
  });
});

describe("raise", () => {
  it("moves a block to the current top + 1", () => {
    expect(raise([node("a", 1), node("b", 2), node("c", 5)], ["a"])).toEqual([{ id: "a", zIndex: 6 }]);
  });

  it("raises a multi-selection together, keeping its own order", () => {
    const nodes = [node("a", 1), node("b", 2), node("c", 3), node("d", 4)];
    expect(raise(nodes, ["c", "a"])).toEqual([
      { id: "a", zIndex: 5 },
      { id: "c", zIndex: 6 },
    ]);
  });

  it("changes nothing when the blocks are already on top", () => {
    const nodes = [node("a", 1), node("b", 2), node("c", 3)];
    expect(raise(nodes, ["c"])).toEqual([]);
    expect(raise(nodes, ["b", "c"])).toEqual([]);
  });

  it("raises legacy blocks above everything", () => {
    expect(raise([node("a", 0), node("b", 0), node("c", 0)], ["a"])).toEqual([{ id: "a", zIndex: 1 }]);
  });

  it("ignores ids that aren't on the canvas", () => {
    expect(raise([node("a", 1), node("b", 2)], ["gone"])).toEqual([]);
    expect(raise([node("a", 1), node("b", 2)], ["gone", "a"])).toEqual([{ id: "a", zIndex: 3 }]);
  });
});
