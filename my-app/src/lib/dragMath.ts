// Moving a block on the zoomed canvas. The canvas layer is scaled, so a
// pointer's travel in screen pixels has to be divided by the zoom to become
// canvas units; otherwise a block crawls behind the mouse when zoomed out
// and races ahead of it when zoomed in.

// How far the canvas is zoomed, measured from an element on it: its size on
// screen over its layout size (which transforms don't change).
export function zoomOf(el: HTMLElement | null): number {
  if (!el) return 1;
  const r = el.getBoundingClientRect();
  // the longer side, so a flat element (a level arrow) still measures well
  const zoom = el.offsetWidth >= el.offsetHeight ? r.width / el.offsetWidth : r.height / el.offsetHeight;
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

// How far the view has panned in total, in screen pixels: useLivePan reports
// each pan step's movement. Only movements are added up, never positions,
// so view changes that aren't pans (a zoom, a restored view) can't make it
// stale; a drag compares it with its value at the press.
let pan = { x: 0, y: 0 };
const panListeners = new Set<() => void>();

export function reportPan(dx: number, dy: number) {
  if (!dx && !dy) return;
  pan = { x: pan.x + dx, y: pan.y + dy };
  panListeners.forEach((listener) => listener());
}

// The pointer's travel over the canvas since the press, in canvas units, for
// each pointer event. Scrolling mid-drag moves the canvas under a still
// pointer, so the pan since the press counts as travel too.
export function dragTravel(press: { x: number; y: number }, zoom: number) {
  const startPan = { ...pan };
  return (mv: { clientX: number; clientY: number }) => ({
    dx: (mv.clientX - press.x - (pan.x - startPan.x)) / zoom,
    dy: (mv.clientY - press.y - (pan.y - startPan.y)) / zoom,
  });
}

// A drag's position for each pointer event: where the block started plus
// the pointer's travel (above), so the block stays under the pointer.
export function dragFrom(origin: { x: number; y: number }, press: { x: number; y: number }, zoom: number) {
  const travel = dragTravel(press, zoom);
  return (mv: { clientX: number; clientY: number }) => {
    const { dx, dy } = travel(mv);
    return { x: origin.x + dx, y: origin.y + dy };
  };
}

// Calls `onMove` for each pointer move during a drag, and again with the
// last pointer position whenever the view pans, so what's dragged follows a
// scroll even while the mouse stays still. Returns the function that stops it.
export function trackDrag<E extends MouseEvent>(
  press: E,
  onMove: (mv: E) => void,
  type: "mousemove" | "pointermove" = "mousemove",
): () => void {
  let last = press;
  const move = (mv: Event) => {
    last = mv as E;
    onMove(last);
  };
  const repan = () => onMove(last);
  window.addEventListener(type, move);
  panListeners.add(repan);
  return () => {
    window.removeEventListener(type, move);
    panListeners.delete(repan);
  };
}
