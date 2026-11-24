import { useCallback, type RefObject } from "react";
import { clearDragHints, setDragHints, snapToOthers, type Rect } from "../lib/alignGuides";
import { dropTarget, groupAfterDrop, movingWith } from "../lib/containment";
import { parseShape } from "../lib/shapes";

// Help for dragging a shape, the way design tools give it:
// - it snaps into line with the shapes around it, with a guide showing the
//   line (lib/alignGuides); holding Ctrl or Alt drags it freely;
// - over a group's frame it would join, the frame lights up, and letting go
//   there makes it a member; letting go outside its group takes it out
//   (lib/containment groupAfterDrop).

interface Positioned {
  id: string;
  x: number;
  y: number;
  type?: string;
  content: string;
}

export interface DragSession {
  // where the shape goes when the pointer puts it at (x, y)
  place(x: number, y: number, free: boolean): { x: number; y: number };
  // let go at (x, y)
  drop(x: number, y: number): void;
}

export type StartDragAssist = (id: string) => DragSession;

// How close (in screen pixels) a line has to be to snap.
const SNAP_PX = 6;

export function useDragAssist({
  nodesRef,
  selectedIdsRef,
  scaleRef,
  regroup,
}: {
  nodesRef: RefObject<Positioned[]>;
  selectedIdsRef: RefObject<string[]>;
  scaleRef: RefObject<number>;
  // gives a dropped shape its new group (null: none), at where it was let go
  regroup: (id: string, x: number, y: number, group: string | null) => void;
}): StartDragAssist {
  return useCallback(
    (id: string) => {
      const nodes = nodesRef.current ?? [];
      const selected = selectedIdsRef.current ?? [];
      const moving = new Set(movingWith(id, selected, nodes));
      // several selected blocks move as they are, in no group of their own
      const alone = !(selected.length >= 2 && selected.includes(id));
      const dragged = nodes.find((n) => n.id === id);
      const size = dragged ? parseShape(dragged.content) : { w: 0, h: 0 };
      const others: Rect[] = nodes
        .filter((n) => n.type === "shape" && !moving.has(n.id))
        .map((n) => {
          const s = parseShape(n.content);
          return { x: n.x, y: n.y, w: s.w, h: s.h };
        });

      return {
        place(x, y, free) {
          const snapped = free ? { x, y, guides: [] } : snapToOthers({ x, y, w: size.w, h: size.h }, others, SNAP_PX / (scaleRef.current || 1));
          let dropInto: Rect | null = null;
          if (alone && groupAfterDrop(id, snapped.x, snapped.y, nodes)) {
            const frame = dropTarget(id, snapped.x, snapped.y, nodes);
            if (frame) dropInto = { x: frame.x, y: frame.y, w: frame.shape.w, h: frame.shape.h };
          }
          setDragHints({ guides: snapped.guides, dropInto });
          return { x: snapped.x, y: snapped.y };
        },
        drop(x, y) {
          clearDragHints();
          if (!alone) return;
          const group = groupAfterDrop(id, x, y, nodes);
          if (group !== undefined) regroup(id, x, y, group);
        },
      };
    },
    [nodesRef, selectedIdsRef, scaleRef, regroup],
  );
}
