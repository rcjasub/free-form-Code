import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import type { CanvasNode } from "./useCanvasHistory";

// Which block draws on top of which. Each block stores a stacking position
// (zIndex — z_index on the server): blocks from before it existed are 0, a
// new block starts at its creation time in ms, and selecting a block raises
// it to the current top + 1. Saved like any other change, so the order
// survives a reload and collaborators see it.

export interface StackEntry {
  id: string;
  zIndex: number;
}

// Each block's depth among the others, 1 = bottom: by stored position, ties
// in array order (the server sends ties in creation order). Ranks rather
// than the stored values, so the CSS z-index stays small.
export function stackDepths(nodes: CanvasNode[]): Map<string, number> {
  const order = nodes
    .map((n, i) => ({ id: n.id, z: n.zIndex ?? 0, i }))
    .sort((a, b) => a.z - b.z || a.i - b.i);
  return new Map(order.map((e, rank) => [e.id, rank + 1]));
}

// New positions that bring these blocks to the front, keeping their order
// among themselves. Empty when they're already the topmost blocks in that
// order, so clicking the top block again saves nothing.
export function raise(nodes: CanvasNode[], ids: string[]): StackEntry[] {
  const depth = stackDepths(nodes);
  const picked = ids.filter((id) => depth.has(id)).sort((a, b) => depth.get(a)! - depth.get(b)!);
  const firstTop = nodes.length - picked.length + 1;
  if (picked.every((id, i) => depth.get(id) === firstTop + i)) return [];

  const top = Math.max(...nodes.map((n) => n.zIndex ?? 0));
  return picked.map((id, i) => ({ id, zIndex: top + 1 + i }));
}

// Depths to render with, and raises newly selected blocks through `onRaise`
// (which saves and broadcasts them). Blocks added to an existing selection
// are raised on their own; the ones already selected stay where they are.
export function useStackOrder(
  nodes: CanvasNode[],
  selectedIds: string[],
  onRaise: (entries: StackEntry[]) => void,
): Map<string, number> {
  const depths = useMemo(() => stackDepths(nodes), [nodes]);

  const prevSelected = useRef<string[]>([]);
  const raiseNew = useEffectEvent((ids: string[]) => {
    const entries = raise(nodes, ids);
    if (entries.length > 0) onRaise(entries);
  });
  useEffect(() => {
    const added = selectedIds.filter((id) => !prevSelected.current.includes(id));
    prevSelected.current = selectedIds;
    if (added.length > 0) raiseNew(added);
  }, [selectedIds]);

  return depths;
}

// The nodes with these blocks' new positions — for a raise here or one
// relayed from a collaborator.
export function applyStack(nodes: CanvasNode[], entries: StackEntry[]): CanvasNode[] {
  const z = new Map(entries.map((e) => [e.id, e.zIndex]));
  return nodes.map((n) => (z.has(n.id) ? { ...n, zIndex: z.get(n.id) } : n));
}
