import { useEffect, useRef, useState } from "react";

export interface Person {
  userId: string;
  username: string;
  color: string;
}

const MAX_DOTS = 3;

// Who's on the canvas right now: overlapping color dots (one per person,
// matching their cursor color) that open a list of names.
export default function PresenceMenu({
  people,
  myId,
  isDark,
}: {
  people: Person[];
  myId: string | undefined;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // close on any click outside the menu
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (people.length === 0) return null;

  // you first, then everyone else in join order
  const sorted = [...people].sort((a, b) => Number(b.userId === myId) - Number(a.userId === myId));
  const panel = isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200";
  const muted = isDark ? "text-[#9b9ba8]" : "text-gray-500";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="People on this canvas"
        className={`h-8 flex items-center gap-2 border rounded shadow-sm px-2 ${panel}`}
      >
        <span className="flex -space-x-1.5">
          {sorted.slice(0, MAX_DOTS).map((p) => (
            <span
              key={p.userId}
              className={`w-3.5 h-3.5 rounded-full border-2 ${isDark ? "border-[#232329]" : "border-white"}`}
              style={{ backgroundColor: p.color }}
            />
          ))}
        </span>
        <span className={`text-xs ${muted}`}>{people.length}</span>
      </button>

      {open && (
        // right-aligned: the menu sits at the right edge, under the theme toggle
        <div className={`absolute top-full right-0 mt-1.5 min-w-40 max-h-64 overflow-y-auto border rounded-lg shadow-sm py-1 ${panel}`}>
          {sorted.map((p) => (
            <div key={p.userId} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className={`text-xs truncate ${isDark ? "text-[#f5f5f5]" : "text-gray-700"}`}>{p.username}</span>
              {p.userId === myId && <span className={`text-xs ${muted}`}>(you)</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
