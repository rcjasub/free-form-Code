import type React from "react";

export type CanvasBackground = "dots" | "grid" | "blank";

export const CANVAS_BACKGROUNDS: CanvasBackground[] = ["dots", "grid", "blank"];

const STORAGE_KEY = "canvas-background";
const SPACING = 28; // px between dots / grid lines at 100% zoom
const MIN_SPACING = 10; // zoomed far out, skip every other one instead of a smear
const GRID_CELL = 20; // px per grid square at 100% zoom
const MAJOR_EVERY = 5; // a stronger line every this many squares

export function loadCanvasBackground(): CanvasBackground {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (CANVAS_BACKGROUNDS as string[]).includes(saved)) return saved as CanvasBackground;
  } catch {
    // storage blocked (private window etc.): fall back to the default
  }
  return "dots";
}

export function saveCanvasBackground(bg: CanvasBackground) {
  try {
    localStorage.setItem(STORAGE_KEY, bg);
  } catch {
    // not remembered, but it still applies for this visit
  }
}

// The canvas root's background: the pattern is sized by the zoom and shifted
// by the pan, so it moves with the blocks instead of sitting still behind them.
export function canvasBackgroundStyle(
  bg: CanvasBackground,
  isDark: boolean,
  scale: number,
  offset: { x: number; y: number },
): React.CSSProperties {
  const style: React.CSSProperties = { backgroundColor: isDark ? "#121212" : "#ffffff" };
  if (bg === "blank") return style;

  style.backgroundPosition = `${offset.x}px ${offset.y}px`;
  if (bg === "grid") return { ...style, ...gridStyle(isDark, scale) };

  let size = SPACING * scale;
  while (size < MIN_SPACING) size *= 2;
  size = round(size);
  style.backgroundSize = `${size}px ${size}px`;
  style.backgroundImage = `radial-gradient(circle, ${isDark ? "#2c2c2c" : "#d1d5db"} 1px, transparent 1px)`;
  return style;
}

const round = (n: number) => Math.round(n * 100) / 100;

// Graph paper: small squares, with a stronger line every MAJOR_EVERY of them.
// Zoomed far out the small squares would blur together, so only the strong
// lines are left.
function gridStyle(isDark: boolean, scale: number): React.CSSProperties {
  const cell = round(GRID_CELL * scale);
  const major = round(GRID_CELL * MAJOR_EVERY * scale);
  const lines = (color: string) =>
    `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`;
  const majorLines = lines(isDark ? "#2a2a2a" : "#dfe1e5");
  if (cell < MIN_SPACING) {
    return { backgroundImage: majorLines, backgroundSize: `${major}px ${major}px` };
  }
  return {
    backgroundImage: `${majorLines}, ${lines(isDark ? "#1c1c1c" : "#f1f2f4")}`,
    backgroundSize: `${major}px ${major}px, ${major}px ${major}px, ${cell}px ${cell}px, ${cell}px ${cell}px`,
  };
}
