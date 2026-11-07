import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// A round search button that springs open into a search field (the button
// stays at its end and turns into an X). It closes on Esc, on the X, or on
// a click elsewhere while it's empty; closing
// clears it. `onChange` reports every keystroke (for live filtering),
// `onSearch` the query when Enter is pressed.
export type ExpandableSearchBarProps = {
  expandDirection?: "left" | "right";
  placeholder?: string;
  onSearch?: (query: string) => void;
  onChange?: (query: string) => void;
  className?: string;
  defaultOpen?: boolean;
  width?: number;
};

const COLLAPSED_SIZE = 40;
const SPRING = { type: "spring", stiffness: 260, damping: 26 } as const;

export default function ExpandableSearchBar({
  expandDirection = "right",
  placeholder = "Search...",
  onSearch,
  onChange,
  className = "",
  defaultOpen = false,
  width = 280,
}: ExpandableSearchBarProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [value, setValue] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const inputPadding = expandDirection === "right" ? "pl-11" : "pl-10";
  const placeholderLeft = expandDirection === "right" ? "left-11" : "left-10";

  function update(next: string) {
    setValue(next);
    onChange?.(next);
  }

  function close() {
    setOpen(false);
    update("");
  }

  // a click elsewhere closes it, unless something's been typed
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node) && open && value === "") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, value]);

  // focus the field once it has started opening
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(id);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSearch?.(value);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: COLLAPSED_SIZE, height: COLLAPSED_SIZE }}
    >
      {/* the round button: opens it, and closes it as the X */}
      <button
        type="button"
        aria-label={open ? "Close search" : "Open search"}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "absolute inset-0 z-20 grid place-items-center rounded-full border",
          "bg-secondary text-foreground/80 hover:text-foreground transition-colors",
        )}
      >
        {open ? <X className="size-4" /> : <Search className="size-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.form
            key="form"
            role="search"
            onSubmit={handleSubmit}
            className={cn(
              "absolute top-0 z-10 h-10 rounded-full border bg-background text-foreground shadow-sm overflow-hidden flex items-center",
              expandDirection === "left" ? "right-0" : "left-0",
            )}
            initial={{ width: COLLAPSED_SIZE, opacity: 0.98 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: COLLAPSED_SIZE, opacity: 0, transition: SPRING }}
            transition={SPRING}
          >
            <div className="relative flex-1 min-w-0 flex items-center">
              <input
                ref={inputRef}
                type="text"
                aria-label={placeholder}
                value={value}
                onChange={(e) => update(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                }}
                placeholder={placeholder}
                className={cn(
                  "w-full bg-transparent text-sm outline-none placeholder-transparent whitespace-nowrap overflow-x-auto",
                  inputPadding,
                )}
              />

              <AnimatePresence>
                {!value && (
                  <motion.span
                    key="ph"
                    className={cn(
                      "pointer-events-none absolute top-1/2 -translate-y-1/2 truncate text-muted-foreground/80 text-sm select-none text-left",
                      placeholderLeft,
                    )}
                    initial={{ opacity: 1, x: 0 }}
                    animate={{ opacity: 0.9, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {placeholder}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              key="go"
              type="submit"
              className="h-10 w-10 shrink-0 grid place-items-center text-muted-foreground hover:text-foreground"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              aria-label="Search"
            >
              <Search className="size-4" />
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
