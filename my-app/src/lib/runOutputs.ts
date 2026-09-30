// Rules for where run output appears on the canvas, shared by the canvas and
// shared-canvas pages:
// - Re-running a block whose unchanged code still has its output showing does
//   nothing (no pile of identical bubbles).
// - If the code changed and the old output is still showing, the new output
//   goes right beside the old one instead of on top of it.

export interface Output {
  id: number;
  x: number;
  y: number;
  text: string;
  isError: boolean;
  // Block that produced it and the exact code/language it ran — absent for
  // runs that didn't come from a block.
  sourceId?: string;
  runKey?: string;
}

const GAP = 12;
const FALLBACK_WIDTH = 320; // OutputBubble's max-w-xs

export function makeRunKey(sourceId: string, language: string, code: string): string {
  return `${sourceId}\u0000${language}\u0000${code}`;
}

// True if this exact run's output is still on the canvas.
export function isAlreadyShown(outputs: Output[], runKey: string): boolean {
  return outputs.some((o) => o.runKey === runKey);
}

// Canvas-space position for a new output from `sourceId`: `anchor` (beside the
// block) if none of its outputs are showing, else just right of its newest one.
// `scale` converts the bubble's on-screen width back to canvas units.
export function placeOutput(
  outputs: Output[],
  sourceId: string | undefined,
  anchor: { x: number; y: number },
  scale: number,
): { x: number; y: number } {
  const previous = sourceId ? outputs.filter((o) => o.sourceId === sourceId).at(-1) : undefined;
  if (!previous) return anchor;

  const el = document.querySelector<HTMLElement>(`[data-output-id="${previous.id}"]`);
  const width = el ? el.getBoundingClientRect().width / scale : FALLBACK_WIDTH;
  return { x: previous.x + width + GAP, y: previous.y };
}
