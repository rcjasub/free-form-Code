import { useSyncExternalStore } from "react";

// Where shapes are on screen while they're being dragged or resized, ahead
// of the page's state. A drag moves a block's element every frame, but the
// page's state (which arrows are drawn from) only catches up every 40ms, so
// arrows attached to a dragged shape trailed behind it. Drags and resizes
// write each frame here; an arrow attached to a shape listed here redraws
// from it (ArrowNode), and nothing else re-renders. Entries are removed when
// the drag ends, by which point the state has the final position.

export interface LiveBox {
  x: number;
  y: number;
  // set by a resize; a move keeps the shape's size
  w?: number;
  h?: number;
}

const live = new Map<string, LiveBox>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setLive(id: string, box: LiveBox) {
  live.set(id, box);
  notify();
}

// several at once (a group drag or resize), with one notification
export function setLiveMany(boxes: [string, LiveBox][]) {
  if (!boxes.length) return;
  for (const [id, box] of boxes) live.set(id, box);
  notify();
}

export function clearLive(ids: string[]) {
  let changed = false;
  for (const id of ids) changed = live.delete(id) || changed;
  if (changed) notify();
}

export function liveBox(id: string): LiveBox | undefined {
  return live.get(id);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// A string that changes whenever any of these shapes' live boxes do ("" when
// none is live), so a component re-renders only for the shapes it cares about.
export function liveKey(ids: (string | undefined)[]): string {
  let key = "";
  for (const id of ids) {
    const b = id ? live.get(id) : undefined;
    if (b) key += `${id}:${b.x},${b.y},${b.w ?? ""},${b.h ?? ""};`;
  }
  return key;
}

export function useLiveKey(ids: (string | undefined)[]): string {
  return useSyncExternalStore(subscribe, () => liveKey(ids));
}
