import { describe, expect, test } from "vitest";
import { OUTPUT_FONT_SIZE, outputFontSize } from "./runOutputs";

describe("outputFontSize", () => {
  test("a block at the default size gets a default-size output", () => {
    expect(outputFontSize(null)).toBeNull();
    expect(outputFontSize(undefined)).toBeNull();
    expect(outputFontSize(14)).toBeNull();
  });

  test("a scaled block's output takes the same scale", () => {
    expect(outputFontSize(28)).toBe(OUTPUT_FONT_SIZE * 2);
    expect(outputFontSize(7)).toBe(OUTPUT_FONT_SIZE / 2);
    expect(outputFontSize(21)).toBe(18); // 1.5x
  });
});
