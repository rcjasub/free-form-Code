import { useCallback, useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

// Smooth panning. Each step of a pan used to set the page's offset state,
// which re-renders the whole canvas page; with a busy canvas that's tens of
// milliseconds a step, so panning stuttered. Now a pan moves the canvas
// layer (and the background's dots or grid) directly, every frame, and the
// offset state only catches up when the pan settles: on release for a drag,
// or a moment after the last scroll for the wheel or a trackpad.
//
// offsetRef is the live position throughout; anything that needs the view
// mid-pan (where the pointer is on the canvas, say) reads it from there.

type Offset = { x: number; y: number };

// how long after the last wheel event a scroll counts as finished
const WHEEL_SETTLE_MS = 120;

export function useLivePan({
  canvasRef,
  rootRef,
  offsetRef,
  scaleRef,
  setOffset,
}: {
  canvasRef: RefObject<HTMLElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  offsetRef: RefObject<Offset>;
  scaleRef: RefObject<number>;
  setOffset: Dispatch<SetStateAction<Offset>>;
}) {
  // true while the canvas is ahead of the offset state
  const panning = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);

  const paint = useCallback(() => {
    const { x, y } = offsetRef.current;
    if (canvasRef.current) canvasRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scaleRef.current})`;
    // the background pattern scrolls with the canvas (see canvasBackgroundStyle)
    if (rootRef.current) rootRef.current.style.backgroundPosition = `${x}px ${y}px`;
  }, [canvasRef, rootRef, offsetRef, scaleRef]);

  // Ends a pan: the offset state takes the position the canvas is showing.
  const endPan = useCallback(() => {
    clearTimeout(settle.current);
    if (!panning.current) return;
    panning.current = false;
    setOffset({ ...offsetRef.current });
  }, [offsetRef, setOffset]);

  // Moves the view to `next` right away. A drag ends its pan itself (endPan
  // on release); a wheel scroll passes `wheel` and ends once it goes quiet.
  const panTo = useCallback(
    (next: Offset, wheel = false) => {
      panning.current = true;
      offsetRef.current = next;
      paint();
      clearTimeout(settle.current);
      if (wheel) settle.current = setTimeout(endPan, WHEEL_SETTLE_MS);
    },
    [offsetRef, paint, endPan],
  );

  // Anything else that re-renders the page mid-pan would put back the
  // transform for the old offset state; put the live one back before paint.
  useLayoutEffect(() => {
    if (panning.current) paint();
  });

  return { panTo, endPan, panning };
}
