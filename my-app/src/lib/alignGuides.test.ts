import { describe, expect, it } from "vitest";
import { snapToOthers } from "./alignGuides";

// Dragging a box near another lines it up, and says along which line.

const other = { x: 100, y: 100, w: 120, h: 60 };

describe("snapToOthers", () => {
  it("lines up a left edge that's close, and draws the guide down both boxes", () => {
    const { x, y, guides } = snapToOthers({ x: 104, y: 300, w: 80, h: 40 }, [other], 6);
    expect({ x, y }).toEqual({ x: 100, y: 300 });
    expect(guides).toEqual([{ axis: "x", at: 100, from: 100, to: 340 }]);
  });

  it("lines up middles, and both axes at once", () => {
    // middle 160 vs 157; top 100 vs 97
    const { x, y } = snapToOthers({ x: 117, y: 97, w: 80, h: 40 }, [other], 6);
    expect({ x, y }).toEqual({ x: 120, y: 100 });
  });

  it("takes the nearest line when there are several", () => {
    const near = { x: 300, y: 0, w: 10, h: 10 };
    // left edge 298: 2 from 300, 198 from 100
    expect(snapToOthers({ x: 298, y: 500, w: 50, h: 50 }, [other, near], 6).x).toBe(300);
  });

  it("leaves a box alone when nothing is close enough", () => {
    const { x, y, guides } = snapToOthers({ x: 400, y: 400, w: 80, h: 40 }, [other], 6);
    expect({ x, y }).toEqual({ x: 400, y: 400 });
    expect(guides).toEqual([]);
  });
});
