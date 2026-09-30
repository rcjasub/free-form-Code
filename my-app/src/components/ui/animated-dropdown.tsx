/**
 * Animated dropdown select.
 *
 * Adapted from "Animated Dropdown" by @emerald-ui (MIT) — https://emerald-ui.com
 * Changes from the original: a controlled value/onChange select instead of a
 * menu of links, compact sizing for use on the canvas, the app's shared cn()
 * and motion import, Escape to close, and click-outside detection in the
 * capture phase (canvas blocks stop mousedown from bubbling).
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface AnimatedDropdownProps<T extends string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
}

export default function AnimatedDropdown<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  triggerClassName,
  menuClassName,
}: AnimatedDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Capture phase: blocks on the canvas call stopPropagation on mousedown,
    // so a bubbling listener would never hear clicks on other blocks.
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div
      ref={wrapperRef}
      data-state={isOpen ? "open" : "closed"}
      className={cn("relative inline-block", className)}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "inline-flex items-center gap-0.5 rounded outline-none cursor-pointer focus-visible:ring-1 focus-visible:ring-current",
          triggerClassName,
        )}
      >
        <span>{selected?.label}</span>
        <motion.span
          className="inline-flex"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <ChevronDown className="h-3 w-3" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "absolute left-0 top-[calc(100%+0.25rem)] z-50 w-max min-w-full overflow-hidden rounded-md border shadow-lg",
              "bg-white border-gray-200 dark:bg-[#232329] dark:border-[#3c3c4a]",
              menuClassName,
            )}
          >
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <motion.button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    variants={{
                      hidden: { opacity: 0, x: -10 },
                      visible: { opacity: 1, x: 0 },
                    }}
                    onClick={() => {
                      setIsOpen(false);
                      if (!isSelected) onChange(option.value);
                    }}
                    className={cn(
                      "block w-full px-2.5 py-1 text-left cursor-pointer transition-colors",
                      "border-b border-gray-100 last:border-b-0 dark:border-[#2e2e38]",
                      "hover:bg-gray-100 dark:hover:bg-[#2e2e38]",
                      isSelected
                        ? "text-gray-900 dark:text-gray-100"
                        : "text-gray-500 dark:text-gray-400",
                    )}
                  >
                    {option.label}
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
