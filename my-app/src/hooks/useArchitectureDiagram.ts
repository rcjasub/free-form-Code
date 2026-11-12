import { useCallback, type RefObject } from "react";
import type { ArchitectureModel } from "../API/architecture";
import type { CanvasNode } from "./useCanvasHistory";
import { layoutArchitecture, type Point } from "../lib/architectureLayout";
import { diagramBlocks, viewToFit } from "../lib/architecturePlacement";
import { boxesOf, clearOffset, type Box } from "../lib/placement";
import { toRestorePayload, type RestorePayload } from "../lib/restore";

// Puts an AI-described architecture on the canvas (Phase 2, step 7): lays it
// out, places it where you're looking (or beside what's already there, so
// nothing is covered), saves the shapes and then the arrows that attach to
// them, makes the lot one undo step, and fits the view to it.

interface Deps {
  // the canvas's blocks right now
  nodesRef: RefObject<CanvasNode[]>;
  // the view: where canvas (0, 0) is on screen, and the zoom
  offsetRef: RefObject<Point>;
  scaleRef: RefObject<number>;
  // Saves blocks, in as few requests as allowed, puts them on the page and
  // tells collaborators. Resolves to the saved ids, in the order given.
  saveBlocks: (blocks: RestorePayload[]) => Promise<string[]>;
  // records the new blocks as one undo step
  recordCreated: (ids: string[]) => void;
  setView: (scale: number, offset: Point) => void;
}

export interface Placed {
  shapeIds: string[];
  arrowIds: string[];
}

export function useArchitectureDiagram({ nodesRef, offsetRef, scaleRef, saveBlocks, recordCreated, setView }: Deps) {
  const place = useCallback(
    async (model: ArchitectureModel, repo?: { url: string; commitSha: string }): Promise<Placed> => {
      const layout = await layoutArchitecture(model);

      // Centered where you're looking...
      const scale = scaleRef.current ?? 1;
      const offset = offsetRef.current ?? { x: 0, y: 0 };
      const center = { x: (window.innerWidth / 2 - offset.x) / scale, y: (window.innerHeight / 2 - offset.y) / scale };
      let origin = { x: Math.round(center.x - layout.width / 2), y: Math.round(center.y - layout.height / 2) };

      // ...unless that covers blocks already there: then to their right.
      const existing = await boxesOf((nodesRef.current ?? []).map(toRestorePayload));
      if (existing.length) {
        const incoming: Box[] = [{ left: origin.x, top: origin.y, right: origin.x + layout.width, bottom: origin.y + layout.height }];
        const { dx } = clearOffset(incoming, existing);
        if (dx !== 0) origin = { x: origin.x + dx, y: Math.min(...existing.map((b) => b.top)) };
      }

      const blocks = diagramBlocks(model, layout, origin, { repo });
      const shapeIds = await saveBlocks(blocks.shapes.map((s) => s.block));
      const idOf = new Map<string, string>();
      blocks.shapes.forEach((s, i) => {
        if (shapeIds[i]) idOf.set(s.sectionId, shapeIds[i]);
      });
      // If the arrows fail to save, the shapes are still there: record them
      // anyway, so one undo clears what did land.
      let arrowIds: string[] = [];
      try {
        arrowIds = await saveBlocks(blocks.arrows(idOf));
      } finally {
        recordCreated([...shapeIds, ...arrowIds].filter(Boolean));
      }
      const view = viewToFit(blocks.bounds, { width: window.innerWidth, height: window.innerHeight });
      setView(view.scale, view.offset);
      return { shapeIds, arrowIds };
    },
    [nodesRef, offsetRef, scaleRef, saveBlocks, recordCreated, setView],
  );

  return { place };
}
