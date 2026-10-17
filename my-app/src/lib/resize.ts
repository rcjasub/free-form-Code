import { pauseGlide, resumeGlide } from "./glide";

// Excalidraw-style resizing for text boxes (text blocks and run outputs):
// a dot on each corner scales the font (and the wrap width with it); the
// left and right edges can be grabbed anywhere to change where lines wrap.
// Dragging from the left or top moves the box so the opposite side stays put.
export type ResizeHandle = "left" | "right" | "nw" | "ne" | "sw" | "se";

// How far the dashed selection outline sits outside a box; the handles sit
// on it (see components/ResizeHandles).
export const BOX_PAD = 6;

export interface ResizeLimits {
  minWidth: number;
  maxWidth: number;
  minFont: number;
  maxFont: number;
}

export interface ResizeStart {
  width: number; // rendered size, canvas units
  height: number;
  x: number;
  y: number;
  font: number | null; // null: the default font size
  defaultFont: number;
  wrap: number | null; // null: lines don't wrap
}

export interface ResizeResult {
  wrap: number | null;
  font: number | null;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The new size and position after the pointer moved `dx` canvas units
// sideways from where the drag started.
export function resizeFrom(handle: ResizeHandle, start: ResizeStart, dx: number, limits: ResizeLimits): ResizeResult {
  const fromLeft = handle === "left" || handle === "nw" || handle === "sw";
  const fromTop = handle === "nw" || handle === "ne";
  const out = fromLeft ? -dx : dx; // how far the dragged side moved outward

  if (handle === "left" || handle === "right") {
    const wrap = Math.round(clamp(start.width + out, limits.minWidth, limits.maxWidth));
    return { wrap, font: start.font, x: fromLeft ? start.x + (start.width - wrap) : start.x, y: start.y };
  }

  const base = start.font ?? start.defaultFont;
  const factor = Math.max(0.1, (start.width + out) / start.width);
  const font = Math.round(clamp(base * factor, limits.minFont, limits.maxFont) * 10) / 10;
  const scaled = font / base; // after clamping, so everything stays in step
  return {
    wrap: start.wrap === null ? null : Math.round(clamp(start.wrap * scaled, limits.minWidth, limits.maxWidth)),
    font,
    x: fromLeft ? start.x + start.width * (1 - scaled) : start.x,
    y: fromTop ? start.y + start.height * (1 - scaled) : start.y,
  };
}

// Runs a resize drag on `el` from a handle's pointerdown. Sizes are in canvas
// units — the screen-to-canvas ratio is read off the element, so this works
// at any zoom.
// - `preview` runs on every pointer move and should write the new size
//   straight to the element: going through React first left the box two
//   frames behind the pointer.
// - `onFrame` gets the new size at most once per animation frame (for state
//   and syncing), and once more with done=true on release if anything changed.
// - `glides`: the element uses lib/glide for other people's moves, so it's
//   paused during the drag.
export function startResizeDrag(
  e: React.PointerEvent,
  el: HTMLElement,
  handle: ResizeHandle,
  start: Omit<ResizeStart, "width" | "height">,
  limits: ResizeLimits,
  onFrame: (result: ResizeResult, done: boolean) => void,
  { preview, glides = true }: { preview: (result: ResizeResult) => void; glides?: boolean },
) {
  e.stopPropagation();
  e.preventDefault();
  const startClientX = e.clientX;
  const ratio = el.getBoundingClientRect().width / el.offsetWidth || 1;
  const full: ResizeStart = { ...start, width: el.offsetWidth, height: el.offsetHeight };
  let latest: ResizeResult = { wrap: start.wrap, font: start.font, x: start.x, y: start.y };
  let frame = 0;
  let sentFrame = false;
  if (glides) pauseGlide(el); // the position follows the drag, not a glide

  function onMove(mv: PointerEvent) {
    latest = resizeFrom(handle, full, (mv.clientX - startClientX) / ratio, limits);
    preview(latest);
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        sentFrame = true;
        onFrame(latest, false);
      });
    }
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    cancelAnimationFrame(frame);
    if (glides) resumeGlide(el);
    if (latest.wrap !== start.wrap || latest.font !== start.font) onFrame(latest, true);
    // dragged back to where it started: undo any in-between size already sent
    else if (sentFrame) onFrame(latest, false);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
