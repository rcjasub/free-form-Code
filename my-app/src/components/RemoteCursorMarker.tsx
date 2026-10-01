import { useMemo, useRef, type CSSProperties } from "react";
import { CursorContext, Cursor, CursorFollow } from "@/components/ui/cursor";

interface Props {
  x: number;
  y: number;
  username: string;
  color: string;
}

// Drives the ui/cursor primitives from a remote collaborator's broadcast
// position instead of the local mouse — CursorProvider only ever tracks
// the pointer of whoever is looking at this screen, so a real multi-user
// cursor needs its own context value per remote user, updated from the
// cursor:move socket event.
//
// containerRef is intentionally never attached to a DOM node: Cursor's
// effect hides the *local* OS cursor via containerRef.current?.parentElement,
// which only makes sense for your own tracked cursor. Leaving it null makes
// that effect a no-op here, so showing a collaborator's cursor never hides
// your own.
// Positions arrive at most every 50ms (the cursor:move throttle), so without
// a spring the arrow jumps between them. Stiff enough to keep up with the
// real mouse; the arrow and label share it so they move in lockstep.
const REMOTE_CURSOR_SPRING = { stiffness: 500, damping: 40 };

export default function RemoteCursorMarker({ x, y, username, color }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const value = useMemo(
    () => ({ cursorPos: { x, y }, isActive: true, containerRef, cursorRef }),
    [x, y],
  );

  return (
    <CursorContext.Provider value={value}>
      <Cursor transition={REMOTE_CURSOR_SPRING}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 14 14"
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}
        >
          <path d="M1.5 1L6 12l2.2-3.8L12 6 1.5 1z" fill={color} stroke="white" strokeWidth="0.5" />
        </svg>
      </Cursor>
      <CursorFollow align="bottom-right" sideOffset={10} transition={REMOTE_CURSOR_SPRING}>
        <div
          // Glass tag: a light see-through tint (no blur — blur frosts what's
          // behind and reads as a solid faded color) and text in the user's
          // color, darkened on the light theme / lightened on dark so it stays
          // readable on the tint.
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[color-mix(in_srgb,var(--c)_25%,transparent)] text-[color-mix(in_srgb,var(--c)_70%,black)] dark:text-[color-mix(in_srgb,var(--c)_55%,white)]"
          style={{ "--c": color } as CSSProperties}
        >
          {username}
        </div>
      </CursorFollow>
    </CursorContext.Provider>
  );
}
