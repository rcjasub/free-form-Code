import { useCallback, useRef, type RefObject } from "react";
import { pauseGlide, resumeGlide } from "../lib/glide";
import { clearLive, setLiveMany, type LiveBox } from "../lib/liveShapes";
import { parseArrow } from "../lib/shapes";

// Keeps a multi-selection together while one of its blocks is dragged.
//
// The dragged block moves its own element every frame, but the rest only
// moved when the page's state caught up (every 40ms), and then glided there
// (the glide that smooths other people's moves), so they trailed behind.
// Now every frame of the drag also moves the rest's elements directly, by
// the same amount, with their glide off. State, saving, syncing and undo
// still go through the page's moveSelection as before; when it catches up
// it puts each block where its element already is.

interface Positioned {
  id: string;
  x: number;
  y: number;
  type?: string;
  content: string;
}

interface Follower {
  id: string;
  el: HTMLElement;
  x: number;
  y: number;
}

function isAttached(content: string) {
  const arrow = parseArrow(content);
  return !!(arrow.fromId || arrow.toId);
}

export function useGroupDragFrames({
  nodesRef,
  selectedIdsRef,
}: {
  nodesRef: RefObject<Positioned[]>;
  selectedIdsRef: RefObject<string[]>;
}) {
  const session = useRef<{ id: string; x: number; y: number; followers: Follower[] } | null>(null);

  return useCallback(
    (id: string, x: number, y: number, done = false) => {
      let s = session.current;
      if (!s || s.id !== id) {
        const sel = selectedIdsRef.current ?? [];
        const moving = new Set(sel.length >= 2 && sel.includes(id) ? sel : [id]);
        moving.delete(id);
        const nodes = nodesRef.current ?? [];
        const dragged = nodes.find((n) => n.id === id);
        if (!dragged) return;
        const followers: Follower[] = [];
        for (const n of nodes) {
          if (!moving.has(n.id)) continue;
          // an arrow attached to a shape is drawn from its shapes' live
          // positions (lib/liveShapes); moving it as well would move it twice
          if (n.type === "arrow" && isAttached(n.content)) continue;
          const el = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(n.id)}"]`);
          if (!el) continue;
          pauseGlide(el);
          followers.push({ id: n.id, el, x: n.x, y: n.y });
        }
        s = session.current = { id, x: dragged.x, y: dragged.y, followers };
      }
      const dx = x - s.x;
      const dy = y - s.y;
      for (const f of s.followers) {
        f.el.style.left = `${f.x + dx}px`;
        f.el.style.top = `${f.y + dy}px`;
        if (done) resumeGlide(f.el);
      }
      // where everything moving is, for arrows attached to it
      if (done) {
        clearLive([id, ...s.followers.map((f) => f.id)]);
        session.current = null;
      } else {
        setLiveMany([[id, { x, y }], ...s.followers.map((f): [string, LiveBox] => [f.id, { x: f.x + dx, y: f.y + dy }])]);
      }
    },
    [nodesRef, selectedIdsRef],
  );
}
