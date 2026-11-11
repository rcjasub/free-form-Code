import { describe, expect, it, vi } from "vitest";
import { dragFrom, dragTravel, reportPan, trackDrag } from "./dragMath";

const pointer = (clientX: number, clientY: number) => new MouseEvent("mousemove", { clientX, clientY });

describe("dragFrom", () => {
  it("moves by the pointer's travel divided by the zoom", () => {
    const drag = dragFrom({ x: 100, y: 100 }, { x: 10, y: 10 }, 2);
    expect(drag(pointer(50, 30))).toEqual({ x: 120, y: 110 });
  });

  it("keeps the block under a still pointer while the view scrolls", () => {
    const drag = dragFrom({ x: 100, y: 100 }, { x: 10, y: 10 }, 1);
    // scrolling down moves the canvas up by 200px on screen
    reportPan(0, -200);
    expect(drag(pointer(10, 10))).toEqual({ x: 100, y: 300 });
  });

  it("converts the scroll to canvas units at any zoom", () => {
    const drag = dragFrom({ x: 0, y: 0 }, { x: 0, y: 0 }, 0.5);
    reportPan(-100, 0);
    expect(drag(pointer(0, 0))).toEqual({ x: 200, y: 0 });
  });

  it("only counts the scroll since the press", () => {
    reportPan(500, 500);
    const drag = dragFrom({ x: 7, y: 9 }, { x: 0, y: 0 }, 1);
    expect(drag(pointer(0, 0))).toEqual({ x: 7, y: 9 });
  });

  it("adds up several scroll steps", () => {
    const drag = dragFrom({ x: 0, y: 0 }, { x: 0, y: 0 }, 1);
    reportPan(0, -150);
    reportPan(0, -150);
    reportPan(0, 100);
    expect(drag(pointer(0, 0))).toEqual({ x: 0, y: 200 });
  });
});

describe("dragTravel", () => {
  it("counts the pointer's travel and the scroll since the press, in canvas units", () => {
    const travel = dragTravel({ x: 100, y: 100 }, 2);
    reportPan(0, -60);
    expect(travel(pointer(140, 100))).toEqual({ dx: 20, dy: 30 });
  });
});

describe("trackDrag", () => {
  it("reruns the move with the last pointer when the view pans", () => {
    const onMove = vi.fn();
    const stop = trackDrag(pointer(1, 2), onMove);
    window.dispatchEvent(pointer(30, 40));
    reportPan(0, -50);
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove.mock.calls[1][0]).toMatchObject({ clientX: 30, clientY: 40 });
    stop();
  });

  it("ignores a pan step that doesn't move the view", () => {
    const onMove = vi.fn();
    const stop = trackDrag(pointer(0, 0), onMove);
    reportPan(0, 0);
    expect(onMove).not.toHaveBeenCalled();
    stop();
  });

  it("can follow pointer events instead of mouse events", () => {
    const onMove = vi.fn();
    const stop = trackDrag(pointer(0, 0), onMove, "pointermove");
    window.dispatchEvent(pointer(3, 3)); // a mousemove: ignored
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 8, clientY: 9 }));
    reportPan(1, 1);
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove.mock.calls[1][0]).toMatchObject({ clientX: 8, clientY: 9 });
    stop();
  });

  it("stops listening once stopped", () => {
    const onMove = vi.fn();
    const stop = trackDrag(pointer(0, 0), onMove);
    stop();
    window.dispatchEvent(pointer(5, 5));
    reportPan(9, 9);
    expect(onMove).not.toHaveBeenCalled();
  });
});
