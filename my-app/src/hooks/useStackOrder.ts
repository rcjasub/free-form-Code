import { useState } from "react";

// Which block draws on top of which, as z-index values. Blocks start in the
// order they were made, a new block lands on top, and selecting a block
// brings it to the front — so an image dragged over a drawing covers it.
// The order is this session's only: a reload goes back to creation order.

export interface Stack {
  ids: string[];
  selectedIds: string[];
  z: Map<string, number>;
  // the highest z handed out so far
  top: number;
}

const EMPTY: Stack = { ids: [], selectedIds: [], z: new Map(), top: 0 };

export function restack(prev: Stack, ids: string[], selectedIds: string[]): Stack {
  let top = prev.top;
  const z = new Map<string, number>();
  for (const id of ids) z.set(id, prev.z.get(id) ?? ++top);

  // newly selected blocks go to the front, keeping their order among themselves
  const raised = selectedIds
    .filter((id) => z.has(id) && !prev.selectedIds.includes(id))
    .sort((a, b) => z.get(a)! - z.get(b)!);
  for (const id of raised) z.set(id, ++top);

  return { ids, selectedIds, z, top };
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function useStackOrder(ids: string[], selectedIds: string[]): Map<string, number> {
  const [stack, setStack] = useState(() => restack(EMPTY, ids, selectedIds));

  // Updated during render rather than in an effect, so a new or selected
  // block is never painted for a frame at its old depth. Compared by
  // contents: the ids array is rebuilt every render (e.g. while dragging).
  if (stack.selectedIds !== selectedIds || !sameIds(stack.ids, ids)) {
    const next = restack(stack, ids, selectedIds);
    setStack(next);
    return next.z;
  }
  return stack.z;
}
