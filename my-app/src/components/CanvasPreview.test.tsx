import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import CanvasPreview, { type PreviewItem } from "./CanvasPreview";
import { fillColor, themeColor } from "../lib/colors";

// A dashboard card's sketch draws each shape as its own outline, in its colors.

const items: PreviewItem[] = [
  { t: "shape", x: 0, y: 0, w: 100, h: 60, k: "ellipse", s: "red", f: "red" },
  { t: "shape", x: 200, y: 0, w: 80, h: 80, k: "diamond", s: "blue", d: 1 },
  { t: "shape", x: 0, y: 200, w: 120, h: 60 },
];

describe("CanvasPreview shapes", () => {
  test("a circle is an ellipse, a diamond a polygon, anything else a rect", () => {
    const { container } = render(<CanvasPreview items={items} isDark={false} />);
    const ellipse = container.querySelector("ellipse")!;
    expect(ellipse).not.toBeNull();
    expect(ellipse.getAttribute("rx")).toBe("50");
    expect(ellipse.getAttribute("ry")).toBe("30");
    // the diamond's corners are its edges' midpoints
    expect(container.querySelector("polygon")!.getAttribute("points")).toBe("240,0 280,40 240,80 200,40");
    expect(container.querySelectorAll("rect")).toHaveLength(1);
  });

  test("in the shape's own colors for the theme, dashed where it is, unfilled when it has no fill", () => {
    for (const isDark of [false, true]) {
      const { container, unmount } = render(<CanvasPreview items={items} isDark={isDark} />);
      const ellipse = container.querySelector("ellipse")!;
      expect(ellipse.getAttribute("stroke")).toBe(themeColor("red", isDark));
      expect(ellipse.getAttribute("fill")).toBe(fillColor("red", isDark));
      const diamond = container.querySelector("polygon")!;
      expect(diamond.getAttribute("stroke")).toBe(themeColor("blue", isDark));
      expect(diamond.getAttribute("stroke-dasharray")).toBeTruthy();
      expect(diamond.getAttribute("fill")).toBe("none");
      // no color saved: the theme's own line color
      expect(container.querySelector("rect")!.getAttribute("stroke")).toBe(themeColor("auto", isDark));
      unmount();
    }
  });
});
