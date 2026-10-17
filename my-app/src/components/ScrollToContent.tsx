import { useEffect, useState, type RefObject } from "react";

const PAN_MS = 350;

interface Props {
  nodeCount: number;
  offset: { x: number; y: number };
  scale: number;
  // the block you last created, typed in or moved (see useCanvasHistory)
  lastTouchedId: RefObject<string | null>;
  onPan: (offset: { x: number; y: number }) => void;
  isDark: boolean;
}

// "Scroll back to content", like Excalidraw's: shows up when none of the
// canvas's blocks are on screen, and glides the view back to the block you
// last worked on (or to the middle of everything, if there isn't one).
export default function ScrollToContent({ nodeCount, offset, scale, lastTouchedId, onPan, isDark }: Props) {
  const [offscreen, setOffscreen] = useState(false);

  // Measured from the DOM after each pan/zoom/change, since a block's size
  // depends on what's in it. Done in a frame callback so layout is current.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const visible = [...document.querySelectorAll("[data-node-id]")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
      });
      setOffscreen(nodeCount > 0 && !visible);
    });
    return () => cancelAnimationFrame(frame);
  }, [nodeCount, offset, scale]);

  function scrollBack() {
    const last = lastTouchedId.current;
    const lastEl = last ? document.querySelector(`[data-node-id="${CSS.escape(last)}"]`) : null;
    const els = lastEl ? [lastEl] : [...document.querySelectorAll("[data-node-id]")];
    if (!els.length) return;

    // Center of the target(s) on screen, turned into canvas coordinates.
    const rects = els.map((el) => el.getBoundingClientRect());
    const midX = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2;
    const midY = (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2;
    const cx = (midX - offset.x) / scale;
    const cy = (midY - offset.y) / scale;
    const from = { ...offset };
    const to = { x: window.innerWidth / 2 - cx * scale, y: window.innerHeight / 2 - cy * scale };

    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / PAN_MS);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out
      onPan({ x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease });
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (!offscreen) return null;
  return (
    <button
      onClick={scrollBack}
      className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg border shadow-sm text-xs font-canvas transition-colors ${
        isDark
          ? "bg-[#232329] border-[#3c3c4a] text-[#e5e5e5] hover:bg-[#3c3c4a]"
          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
      }`}
    >
      Scroll back to content
    </button>
  );
}
