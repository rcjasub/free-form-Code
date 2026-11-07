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

// A drag's position for each pointer event: where the block started plus
// the pointer's travel since the press, in canvas units.
export function dragFrom(origin: { x: number; y: number }, press: { x: number; y: number }, zoom: number) {
  return (mv: { clientX: number; clientY: number }) => ({
    x: origin.x + (mv.clientX - press.x) / zoom,
    y: origin.y + (mv.clientY - press.y) / zoom,
  });
}
