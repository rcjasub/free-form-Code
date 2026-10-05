// Other people's drags arrive about 25 times a second (each block sends its
// position every DRAG_SYNC_INTERVAL_MS = 40ms). Jumping straight to each one
// looks steppy, so a block's left/top get a short transition that carries it
// between updates — a little longer than the update interval, so it's still
// moving when the next position arrives.
//
// It's switched off while this user drags or resizes the block themselves:
// the DOM is moved directly then, every frame, and lag under the mouse would
// feel worse than steps. Touching el.style only (not React state) keeps a drag
// from re-rendering anything; React leaves the value alone because the
// `transition` prop it renders never changes.
export const BASE_TRANSITION = "opacity 0.15s";
export const GLIDE_TRANSITION = `${BASE_TRANSITION}, left 60ms linear, top 60ms linear`;

export function pauseGlide(el: HTMLElement | null) {
  if (el) el.style.transition = BASE_TRANSITION;
}

export function resumeGlide(el: HTMLElement | null) {
  if (el) el.style.transition = GLIDE_TRANSITION;
}
