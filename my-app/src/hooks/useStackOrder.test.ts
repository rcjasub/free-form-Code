import { describe, it, expect } from "vitest";
import { restack, type Stack } from "./useStackOrder";

const empty: Stack = { ids: [], selectedIds: [], z: new Map(), top: 0 };
const order = (s: Stack) => [...s.z.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

describe("restack", () => {
  it("stacks blocks in creation order", () => {
    expect(order(restack(empty, ["a", "b", "c"], []))).toEqual(["a", "b", "c"]);
  });

  it("brings a selected block to the front", () => {
    const s = restack(empty, ["a", "b", "c"], []);
    expect(order(restack(s, ["a", "b", "c"], ["a"]))).toEqual(["b", "c", "a"]);
  });

  it("keeps a block on top after it's deselected", () => {
    let s = restack(empty, ["a", "b", "c"], []);
    s = restack(s, ["a", "b", "c"], ["a"]);
    expect(order(restack(s, ["a", "b", "c"], []))).toEqual(["b", "c", "a"]);
  });

  it("puts a new block above everything, including a raised one", () => {
    let s = restack(empty, ["a", "b"], []);
    s = restack(s, ["a", "b"], ["a"]);
    expect(order(restack(s, ["a", "b", "c"], ["a"]))).toEqual(["b", "a", "c"]);
  });

  it("raises a multi-selection together, keeping its own order", () => {
    const s = restack(empty, ["a", "b", "c", "d"], []);
    expect(order(restack(s, ["a", "b", "c", "d"], ["c", "a"]))).toEqual(["b", "d", "a", "c"]);
  });

  it("only raises the block added to an existing selection", () => {
    let s = restack(empty, ["a", "b", "c"], []);
    s = restack(s, ["a", "b", "c"], ["a"]);
    s = restack(s, ["a", "b", "c"], ["a", "b"]);
    expect(order(s)).toEqual(["c", "a", "b"]);
  });

  it("drops deleted blocks", () => {
    const s = restack(empty, ["a", "b"], []);
    expect([...restack(s, ["b"], []).z.keys()]).toEqual(["b"]);
  });
});
