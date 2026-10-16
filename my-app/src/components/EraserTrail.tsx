import { useEffect, useRef } from "react";

// How long a point of the trail stays visible, and its width at the pointer.
const TRAIL_MS = 220;
const MAX_WIDTH = 4;

interface Props {
  active: boolean; // erase mode
  isDark: boolean;
}

// A short, fading streak behind the pointer while erasing (like Excalidraw's
// eraser). It draws on its own screen-sized canvas from window pointer events
// and requestAnimationFrame, so moving the mouse never re-renders the page.
export default function EraserTrail({ active, isDark }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const points: { x: number; y: number; t: number }[] = [];
    let frame = 0;

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!canvas || !ctx) return;
      const now = performance.now();
      while (points.length && now - points[0].t > TRAIL_MS) points.shift();
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Each segment is wider and stronger the newer it is, so the trail
      // tapers from the pointer to a point. It fades by blending the color
      // into the canvas background rather than with transparency, where the
      // overlapping round ends of neighbouring segments would show as dots.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const [from, to] = isDark ? [[18, 18, 18], [64, 64, 72]] : [[255, 255, 255], [222, 224, 229]];
      for (let i = 1; i < points.length; i++) {
        const life = 1 - (now - points[i].t) / TRAIL_MS;
        const [r, g, b] = from.map((c, k) => Math.round(c + (to[k] - c) * life));
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth = Math.max(0.5, MAX_WIDTH * life);
        ctx.beginPath();
        ctx.moveTo(points[i - 1].x, points[i - 1].y);
        ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }

      // Keep animating until the last bit has faded out.
      frame = points.length ? requestAnimationFrame(draw) : 0;
    }

    function onPointerMove(e: PointerEvent) {
      if (!(e.buttons & 1)) return; // only while the button is held (erasing)
      points.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (!frame) frame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, [active, isDark]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="fixed inset-0 w-screen h-screen pointer-events-none z-30" />;
}
