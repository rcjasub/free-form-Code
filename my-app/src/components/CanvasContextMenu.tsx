import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, CopyPlus, Link, Link2Off, Scissors, ClipboardPaste, Trash2 } from "lucide-react";

export interface CanvasContextMenuProps {
  // where it opens, in screen pixels
  x: number;
  y: number;
  // false when right-clicking empty canvas — then only Paste applies
  onBlock: boolean;
  link: string | null;
  isDark: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSaveLink: (link: string | null) => void;
  onClose: () => void;
}

const MENU_WIDTH = 210;

// Turns what the user typed into a link, or null if it isn't one.
// "example.com" gets https:// added; anything that isn't http(s) is refused,
// matching what the backend accepts.
function normalizeLink(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export default function CanvasContextMenu({
  x,
  y,
  onBlock,
  link,
  isDark,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onSaveLink,
  onClose,
}: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editingLink, setEditingLink] = useState(false);
  const [draft, setDraft] = useState(link ?? "");
  const [linkError, setLinkError] = useState(false);

  // Close on a click anywhere else, Escape, or scrolling the canvas.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onClose);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  function saveLink() {
    if (!draft.trim()) {
      onSaveLink(null); // an emptied box removes the link
      return;
    }
    const normalized = normalizeLink(draft);
    if (!normalized) {
      setLinkError(true);
      return;
    }
    onSaveLink(normalized);
  }

  // keep the whole menu on screen when opened near the right/bottom edge
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - (onBlock ? 290 : 50));

  const item = (label: string, icon: ReactNode, onClick: () => void, hint?: string, danger?: boolean) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-left transition-colors ${
        danger
          ? isDark ? "text-[#f5b5b5] hover:bg-[#3a1f1f]" : "text-red-600 hover:bg-red-50"
          : isDark ? "text-[#e5e5e5] hover:bg-[#3c3c4a]" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      <span className="w-3.5 flex justify-center opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className={isDark ? "text-[#6b6b78]" : "text-gray-400"}>{hint}</span>}
    </button>
  );
  const divider = <div className={`my-1 h-px ${isDark ? "bg-[#3c3c4a]" : "bg-gray-100"}`} />;

  return (
    <div
      ref={ref}
      data-context-menu
      // keep clicks in the menu from reaching the canvas (drawing, panning, deselecting)
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className={`fixed z-50 p-1 border rounded-lg shadow-lg text-xs ${
        isDark ? "bg-[#232329] border-[#3c3c4a]" : "bg-white border-gray-200"
      }`}
      style={{ left, top, width: MENU_WIDTH }}
    >
      {editingLink ? (
        <div className="p-1.5 flex flex-col gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setLinkError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveLink();
              if (e.key === "Escape") onClose();
            }}
            placeholder="https://example.com"
            className={`w-full px-2 py-1 rounded border outline-none ${
              isDark
                ? "bg-[#121212] border-[#3c3c4a] text-[#f5f5f5] focus:border-[#4fb4f2]"
                : "bg-white border-gray-200 text-gray-800 focus:border-[#4fb4f2]"
            }`}
          />
          {linkError && (
            <span className={isDark ? "text-[#f5b5b5]" : "text-red-600"}>Enter a web address (http or https)</span>
          )}
          <div className="flex justify-end gap-1">
            <button
              onClick={onClose}
              className={`px-2 py-1 rounded ${isDark ? "text-[#9b9ba8] hover:bg-[#3c3c4a]" : "text-gray-500 hover:bg-gray-100"}`}
            >
              Cancel
            </button>
            <button onClick={saveLink} className="px-2 py-1 rounded bg-[#4fb4f2] text-white hover:bg-[#3aa3e3]">
              Save
            </button>
          </div>
        </div>
      ) : onBlock ? (
        <>
          {item("Cut", <Scissors size={13} />, onCut, "Ctrl+X")}
          {item("Copy", <Copy size={13} />, onCopy, "Ctrl+C")}
          {item("Paste", <ClipboardPaste size={13} />, onPaste, "Ctrl+V")}
          {item("Duplicate", <CopyPlus size={13} />, onDuplicate, "Ctrl+D")}
          {divider}
          {item(link ? "Edit link" : "Add link", <Link size={13} />, () => setEditingLink(true))}
          {link && item("Remove link", <Link2Off size={13} />, () => onSaveLink(null))}
          {divider}
          {item("Delete", <Trash2 size={13} />, onDelete, "Del", true)}
        </>
      ) : (
        item("Paste", <ClipboardPaste size={13} />, onPaste, "Ctrl+V")
      )}
    </div>
  );
}
