import { describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCanvasHistory, useCanvasShortcuts, type CanvasNode, type CanvasOps } from "./useCanvasHistory";

const NODES: CanvasNode[] = [
  { id: "a", x: 0, y: 0, content: "alpha" },
  { id: "b", x: 100, y: 0, content: "beta" },
  { id: "c", x: 200, y: 0, content: "gamma" },
];

function setup(nodes = NODES) {
  const ops: CanvasOps = {
    deleteNode: vi.fn(),
    moveNode: vi.fn(),
    applyLanguage: vi.fn(),
    applyShape: vi.fn(),
    applyLink: vi.fn(),
    applySize: vi.fn(),
    recreateBlock: vi.fn(async () => "copy"),
    restoreBlocks: vi.fn(async (srcs: CanvasNode[]) => srcs.map((s) => `new-${s.id}`)),
    clearOutputs: vi.fn(),
  };
  const canvasRef = { current: document.createElement("div") };
  const rootRef = { current: document.createElement("div") };
  const { result } = renderHook(() => {
    const history = useCanvasHistory(nodes);
    const shortcuts = useCanvasShortcuts({ enabled: true, nodes, history, ops, canvasRef, rootRef });
    return { history, ...shortcuts };
  });
  return { result, ops };
}

// Like setup, with the canvas element in the document so mouse events on it
// reach the hook's window listeners with it as the target.
function setupWithCanvas(nodes = NODES) {
  const canvasEl = document.createElement("div");
  document.body.appendChild(canvasEl);
  const ops: CanvasOps = {
    deleteNode: vi.fn(),
    moveNode: vi.fn(),
    applyLanguage: vi.fn(),
    applyShape: vi.fn(),
    applyLink: vi.fn(),
    applySize: vi.fn(),
    recreateBlock: vi.fn(async () => "copy"),
    restoreBlocks: vi.fn(async (srcs: CanvasNode[]) => srcs.map((s) => `new-${s.id}`)),
    clearOutputs: vi.fn(),
  };
  const canvasRef = { current: canvasEl };
  const rootRef = { current: document.createElement("div") };
  const { result } = renderHook(() => {
    const history = useCanvasHistory(nodes);
    const shortcuts = useCanvasShortcuts({ enabled: true, nodes, history, ops, canvasRef, rootRef });
    return { history, ...shortcuts };
  });
  return { result, ops, canvasEl };
}

// Keys go to window, like real presses on the canvas. Undo is async.
async function press(key: string, ctrl = false) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: ctrl, bubbles: true }));
  });
}

describe("undo", () => {
  test("a multi-block drag (one group) undoes in a single Ctrl+Z", async () => {
    const { result, ops } = setup();
    act(() => {
      result.current.history.record({ kind: "move", id: "c", x: 7, y: 7 }); // an earlier, separate move
      result.current.history.record({ kind: "move", id: "a", x: 0, y: 0, group: 1 });
      result.current.history.record({ kind: "move", id: "b", x: 100, y: 0, group: 1 });
    });

    await press("z", true);
    expect(ops.moveNode).toHaveBeenCalledTimes(2);
    expect(ops.moveNode).toHaveBeenCalledWith("b", 100, 0, false);
    expect(ops.moveNode).toHaveBeenCalledWith("a", 0, 0, false);

    await press("z", true);
    expect(ops.moveNode).toHaveBeenLastCalledWith("c", 7, 7, false);
  });

  test("a resize puts back both the size and the position", async () => {
    const { result, ops } = setup();
    act(() => result.current.history.record({ kind: "resize", id: "a", wrapWidth: null, fontSize: 14, x: 3, y: 4 }));
    await press("z", true);
    expect(ops.applySize).toHaveBeenCalledWith("a", null, 14);
    expect(ops.moveNode).toHaveBeenCalledWith("a", 3, 4, false);
  });

  test("undoing a delete restores every block in one restoreBlocks call", async () => {
    const { result, ops } = setup();
    act(() => result.current.history.record({ kind: "delete", nodes: NODES }));
    await press("z", true);
    expect(ops.restoreBlocks).toHaveBeenCalledTimes(1);
    expect(ops.restoreBlocks).toHaveBeenCalledWith(NODES);
    expect(ops.recreateBlock).not.toHaveBeenCalled();
  });

  test("skips entries for blocks that no longer exist", async () => {
    const { result, ops } = setup();
    act(() => {
      result.current.history.record({ kind: "move", id: "a", x: 1, y: 1 });
      result.current.history.record({ kind: "move", id: "gone", x: 9, y: 9 });
    });
    await press("z", true);
    expect(ops.moveNode).toHaveBeenCalledTimes(1);
    expect(ops.moveNode).toHaveBeenCalledWith("a", 1, 1, false);
  });
});

describe("select all / delete all", () => {
  test("Ctrl+A selects every block", async () => {
    const { result } = setup();
    await press("a", true);
    expect(result.current.selectedIds).toEqual(["a", "b", "c"]);
  });

  test("Ctrl+Backspace asks first, and cancelling deletes nothing", async () => {
    const { result, ops } = setup();
    await press("Backspace", true);
    expect(result.current.deleteAllPrompt?.count).toBe(3);
    expect(ops.deleteNode).not.toHaveBeenCalled();

    await press("Delete"); // keys behind the open confirmation do nothing
    expect(ops.deleteNode).not.toHaveBeenCalled();

    act(() => result.current.deleteAllPrompt!.onCancel());
    expect(result.current.deleteAllPrompt).toBeNull();
    expect(ops.deleteNode).not.toHaveBeenCalled();
  });

  test("confirming Delete all deletes everything and clears outputs as one undo step", async () => {
    const { result, ops } = setup();
    await press("Backspace", true);
    act(() => result.current.deleteAllPrompt!.onConfirm());
    expect(result.current.deleteAllPrompt).toBeNull();
    expect(ops.deleteNode).toHaveBeenCalledTimes(3);
    for (const n of NODES) expect(ops.deleteNode).toHaveBeenCalledWith(n.id, false);
    expect(ops.clearOutputs).toHaveBeenCalled();

    await press("z", true);
    expect(ops.restoreBlocks).toHaveBeenCalledTimes(1);
    expect(ops.restoreBlocks).toHaveBeenCalledWith(NODES);
  });

  test("an empty canvas doesn't ask", async () => {
    const { result } = setup([]);
    await press("Backspace", true);
    expect(result.current.deleteAllPrompt).toBeNull();
  });

  test("Delete removes the whole selection after Ctrl+A", async () => {
    const { ops } = setup();
    await press("a", true);
    await press("Delete");
    expect(ops.deleteNode).toHaveBeenCalledTimes(3);
  });
});

describe("right-click menu with a selection", () => {
  // a real right-click on the canvas background: mousedown + mouseup (button 2)
  async function rightClick(el: HTMLElement) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: 5, clientY: 5, bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseup", { button: 2, clientX: 5, clientY: 5, bubbles: true }));
    });
  }

  test("right-clicking empty canvas keeps the selection, and Delete removes all of it in one undo step", async () => {
    const { result, ops, canvasEl } = setupWithCanvas();
    await press("a", true); // select all 3
    await rightClick(canvasEl);
    expect(result.current.selectedIds).toHaveLength(3);
    expect(result.current.contextMenu?.deleteCount).toBe(3);

    act(() => result.current.contextMenu!.onDelete());
    expect(ops.deleteNode).toHaveBeenCalledTimes(3);
    await press("z", true);
    expect(ops.restoreBlocks).toHaveBeenCalledTimes(1);
  });

  test("with nothing selected, the empty-canvas menu has no Delete", async () => {
    const { result, canvasEl } = setupWithCanvas();
    await rightClick(canvasEl);
    expect(result.current.contextMenu?.deleteCount).toBe(0);
  });
});
