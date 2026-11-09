import { useEffect, useLayoutEffect, useRef } from "react";

// Remembers where you were on each canvas (its pan and zoom) in this
// browser, and puts you back there when you open it again.

export interface SavedView {
  scale: number;
  offset: { x: number; y: number };
}

const PREFIX = "canvas-view:";
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const SAVE_DELAY_MS = 250;

// A saved view, or null if it's missing or not a view.
export function parseSavedView(raw: string | null): SavedView | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { scale?: unknown; x?: unknown; y?: unknown };
    const { scale, x, y } = v ?? {};
    if (![scale, x, y].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return {
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale as number)),
      offset: { x: x as number, y: y as number },
    };
  } catch {
    return null;
  }
}

export function useSavedView(
  key: string | null | undefined,
  scale: number,
  offset: { x: number; y: number },
  setScale: (s: number) => void,
  setOffset: (o: { x: number; y: number }) => void,
) {
  // the canvas whose view has been restored; nothing is saved before that,
  // so the default view never overwrites the saved one
  const restoredFor = useRef<string | null>(null);

  // before the first paint, so the canvas doesn't flash at the default view
  useLayoutEffect(() => {
    if (!key) return;
    let saved: SavedView | null = null;
    try {
      saved = parseSavedView(localStorage.getItem(PREFIX + key));
    } catch {
      // storage blocked (private window etc.): start at the default view
    }
    if (saved) {
      setScale(saved.scale);
      setOffset(saved.offset);
    }
    restoredFor.current = key;
  }, [key, setScale, setOffset]);

  useEffect(() => {
    if (!key || restoredFor.current !== key) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ scale, x: Math.round(offset.x), y: Math.round(offset.y) }));
      } catch {
        // not remembered this time
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, scale, offset]);
}
