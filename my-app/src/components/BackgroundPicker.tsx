import { Grid3x3, Grip, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { CANVAS_BACKGROUNDS, type CanvasBackground } from "../lib/canvasBackground";

const BACKGROUND_OPTIONS: Record<CanvasBackground, { label: string; icon: React.ReactNode }> = {
  dots: { label: "Dots", icon: <Grip /> },
  grid: { label: "Grid", icon: <Grid3x3 /> },
  blank: { label: "Blank", icon: <Square /> },
};

export function BackgroundIcon({ background }: { background: CanvasBackground }) {
  return BACKGROUND_OPTIONS[background].icon;
}

// Dots / Grid / Blank as one segmented control: all three in view, the
// current one raised.
export default function BackgroundPicker({
  value,
  onChange,
  className,
}: {
  value: CanvasBackground;
  onChange: (bg: CanvasBackground) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Canvas background"
      className={cn("flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5 dark:bg-[#2c2c36]", className)}
    >
      {CANVAS_BACKGROUNDS.map((bg) => {
        const selected = bg === value;
        return (
          <button
            key={bg}
            type="button"
            role="radio"
            aria-checked={selected}
            title={BACKGROUND_OPTIONS[bg].label}
            onClick={() => onChange(bg)}
            className={cn(
              "flex size-6 items-center justify-center rounded transition-colors [&>svg]:size-3.5",
              selected
                ? "bg-white text-gray-900 shadow-sm dark:bg-[#4a4a58] dark:text-[#f5f5f5]"
                : "text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]",
            )}
          >
            {BACKGROUND_OPTIONS[bg].icon}
          </button>
        );
      })}
    </div>
  );
}
