import { describe, expect, test, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import ResizeHandles from "./ResizeHandles";

describe("ResizeHandles", () => {
  test("each of the four edges can be grabbed, as its own handle", () => {
    const onPointerDown = vi.fn();
    const { container } = render(<ResizeHandles isDark={false} onPointerDown={onPointerDown} />);
    for (const side of ["left", "right", "top", "bottom"]) {
      fireEvent.pointerDown(container.querySelector(`[data-side="${side}"]`)!);
      expect(onPointerDown).toHaveBeenLastCalledWith(expect.anything(), side);
    }
  });

  test("the fit line shows only for a box that wraps, and clicking it fits the box", () => {
    const { container, rerender } = render(<ResizeHandles isDark={false} onPointerDown={() => {}} />);
    expect(container.querySelector("[data-fit]")).toBeNull();

    const onFit = vi.fn();
    const onPointerDown = vi.fn();
    rerender(<ResizeHandles isDark={false} onPointerDown={onPointerDown} onFit={onFit} />);
    fireEvent.pointerDown(container.querySelector("[data-fit]")!, { button: 0 });
    expect(onFit).toHaveBeenCalledTimes(1);
    expect(onPointerDown).not.toHaveBeenCalled(); // not a resize
  });

  test("the fit line sits outside the right side, with a gap to the outline", () => {
    const { container } = render(<ResizeHandles isDark={false} onPointerDown={() => {}} onFit={() => {}} />);
    const fit = container.querySelector<HTMLElement>("[data-fit]")!;
    // its 10px grab area is centered 12px past the outline (at -6px)
    expect(fit.style.right).toBe("calc(-6px - calc(17px * var(--inv-zoom, 1)))");
    expect(fit.style.left).toBe("");
  });
});
