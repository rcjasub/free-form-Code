import { describe, expect, it } from "vitest";
import { AUTO, FILL_COLORS, STROKE_COLORS, TRANSPARENT, colorName, themeColor } from "./colors";

describe("themeColor", () => {
  it("draws a palette color in the shade that suits the theme", () => {
    expect(themeColor("cyan", true)).toBe("#8be9fd");
    expect(themeColor("cyan", false)).not.toBe("#8be9fd");
  });

  it("follows the theme's text color for auto", () => {
    expect(themeColor(AUTO, true)).not.toBe(themeColor(AUTO, false));
  });

  it("draws anything else (a hex code saved before the palette) as-is", () => {
    expect(themeColor("#e03131", true)).toBe("#e03131");
    expect(themeColor("#e03131", false)).toBe("#e03131");
  });
});

describe("swatches", () => {
  it("offer the same palette for strokes and fills", () => {
    expect(STROKE_COLORS[0]).toBe(AUTO);
    expect(FILL_COLORS[0]).toBe(TRANSPARENT);
    expect(STROKE_COLORS.slice(1)).toEqual(FILL_COLORS.slice(1));
  });

  it("have readable names", () => {
    expect(colorName("purple")).toBe("Purple");
    expect(colorName(TRANSPARENT)).toBe("None");
  });
});
