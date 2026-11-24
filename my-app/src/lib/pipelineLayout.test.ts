import { describe, expect, it } from "vitest";
import { depths, pipelineLayout, STEP_HEIGHT } from "./pipelineLayout";

describe("depths", () => {
  it("puts a step after the longest chain leading to it", () => {
    const d = depths(["a", "b", "c", "d"], [["a", "b"], ["b", "c"], ["a", "c"], ["c", "d"]]);
    expect(Object.fromEntries(d)).toEqual({ a: 0, b: 1, c: 2, d: 3 });
  });

  it("stops on a loop instead of running forever", () => {
    const d = depths(["a", "b"], [["a", "b"], ["b", "a"]]);
    expect(Math.max(...d.values())).toBeLessThan(2);
  });
});

describe("pipelineLayout", () => {
  it("stacks a chain top to bottom, with straight links between", () => {
    const { pos, paths, width, height } = pipelineLayout(["a", "b", "c"], [["a", "b"], ["b", "c"]], "vertical", 200);
    expect([...pos.values()].map((p) => p.x)).toEqual([0, 0, 0]);
    const ys = [...pos.values()].map((p) => p.y);
    expect(ys[0]).toBe(0);
    expect(ys[1]).toBeGreaterThan(STEP_HEIGHT);
    expect(ys[2]).toBeGreaterThan(ys[1] + STEP_HEIGHT);
    expect(width).toBe(200);
    expect(height).toBe(ys[2] + STEP_HEIGHT);
    // from the middle of one step's bottom to the next one's top
    expect(paths[0]).toBe(`M100 ${STEP_HEIGHT}V${ys[1]}`);
  });

  it("puts steps that fork side by side, the links turning at a halfway line", () => {
    const { pos, paths } = pipelineLayout(["a", "b", "c"], [["a", "b"], ["a", "c"]], "horizontal", 150);
    const b = pos.get("b")!;
    const c = pos.get("c")!;
    expect(b.x).toBe(c.x);
    expect(c.y).toBeGreaterThan(b.y);
    // a sits between them
    expect(pos.get("a")!.y).toBe((b.y + c.y) / 2);
    expect(paths[0]).toContain("Q");
  });
});
