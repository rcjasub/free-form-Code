import { describe, expect, it } from "vitest";
import { canvasBackgroundStyle } from "./canvasBackground";

describe("canvasBackgroundStyle", () => {
  it("blank is just the color", () => {
    expect(canvasBackgroundStyle("blank", false, 1, { x: 5, y: 5 })).toEqual({ backgroundColor: "#ffffff" });
  });

  it("follows pan and zoom", () => {
    const style = canvasBackgroundStyle("dots", true, 2, { x: 30, y: -12 });
    expect(style.backgroundSize).toBe("56px 56px");
    expect(style.backgroundPosition).toBe("30px -12px");
    expect(style.backgroundColor).toBe("#121212");
  });

  it("grid is small squares with a stronger line every 5", () => {
    const style = canvasBackgroundStyle("grid", false, 1, { x: 7, y: 9 });
    expect(String(style.backgroundImage).match(/linear-gradient/g)).toHaveLength(4);
    expect(style.backgroundSize).toBe("100px 100px, 100px 100px, 20px 20px, 20px 20px");
    expect(style.backgroundPosition).toBe("7px 9px");
  });

  it("grid zoomed far out keeps only the stronger lines", () => {
    const style = canvasBackgroundStyle("grid", false, 0.25, { x: 0, y: 0 });
    expect(String(style.backgroundImage).match(/linear-gradient/g)).toHaveLength(2);
    expect(style.backgroundSize).toBe("25px 25px");
  });

  it("zoomed far out, spaces the pattern out instead of packing it tight", () => {
    // 28 * 0.1 = 2.8px would be a smear; doubled until it's at least 10px
    expect(canvasBackgroundStyle("dots", false, 0.1, { x: 0, y: 0 }).backgroundSize).toBe("11.2px 11.2px");
  });
});
