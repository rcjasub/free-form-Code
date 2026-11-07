import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { AUTO, FILL_COLORS, STROKE_COLORS, TRANSPARENT, colorName, fillColor, themeColor } from "../lib/colors";
import type { PanelValue } from "../hooks/useDiagram";

// A quiet, monochrome control panel: rows with the label on the left and
// the control on the right, grouped in folders that fold away. Nothing is
// colored but the swatches themselves; what's active is just a brighter
// surface. The surfaces are translucent black on the light theme and
// translucent white on the dark one (the `dark:` classes).

const ROW = "flex h-9 items-center justify-between gap-3 rounded-lg px-2.5";
// The toolbar's palette: its background (white / #232329), a picked tool's
// box (gray-100 / #3c3c4a) and text (gray-800 / #f5f5f5), the rest's text
// (gray-400 / #9b9ba8). Rows sit a step above the panel's background.
const LABEL = "text-[13px] font-medium text-gray-500 dark:text-[#9b9ba8]";
const SURFACE = "bg-gray-50 dark:bg-[#2a2a33]";
const PICKED = "bg-gray-100 dark:bg-[#3c3c4a]";
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const;

function Folder({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between py-1.5 text-[13px] font-semibold tracking-[-0.01em] text-gray-500 hover:text-gray-800 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]"
      >
        {title}
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="flex flex-col gap-1.5 pb-1.5">{children}</div>}
    </div>
  );
}

// A segmented control whose highlight slides to the chosen option.
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; title: string; text: React.ReactNode }[];
  onPick: (v: T) => void;
}) {
  const pill = useId();
  return (
    <div className={cn(ROW, SURFACE, "pr-1")}>
      <span className={LABEL}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-md p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.title}
              onClick={() => onPick(o.value)}
              className={cn(
                // three longer words (Precise / Sketch / Sloppy) only fit beside
                // the label with a little less padding
                "relative rounded-[5px] py-1 text-[12px] font-medium transition-colors",
                options.length > 2 ? "px-1.5" : "px-2",
                on ? "text-gray-800 dark:text-[#f5f5f5]" : "text-gray-400 hover:text-gray-700 dark:text-[#9b9ba8] dark:hover:text-[#f5f5f5]",
              )}
            >
              {on && (
                <motion.span
                  layoutId={pill}
                  transition={SPRING}
                  className={cn("absolute inset-0 rounded-[5px]", PICKED)}
                />
              )}
              <span className="relative">{o.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A full-width bar: drag (or arrow keys) to set it, with the label inside on
// the left and the value on the right. It shows the value as it moves, but
// only reports the one it's let go at, so a drag is one change (and one undo
// step), not dozens.
function Slider({
  label,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  // While dragging, the bar follows the pointer exactly (this, 0 to 1)
  // rather than hopping from step to step; the number still shows the step
  // it'll land on, and the bar eases onto it when let go.
  const [pointerAt, setPointerAt] = useState<number | null>(null);
  const shown = draft ?? value;
  const fraction = pointerAt ?? (shown - min) / (max - min);
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  // the bar glides to a new value (a click, a key, letting go), but tracks
  // the pointer 1:1 while it's being dragged
  const glide = pointerAt === null ? "150ms cubic-bezier(0.22, 1, 0.36, 1)" : "0ms";

  function fractionAt(clientX: number) {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    // a click glides the bar to where it landed; only moving starts tracking
    let latest = snap(min + fractionAt(e.clientX) * (max - min));
    setDraft(latest);
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const at = fractionAt(ev.clientX);
      latest = snap(min + at * (max - min));
      setPointerAt(at);
      setDraft(latest);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setPointerAt(null);
      setDraft(null);
      if (latest !== value) onCommit(latest);
    };
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    setDraft(snap(shown + delta));
  }

  function onKeyUp() {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  }

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={shown}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onKeyUp}
      className={cn(
        "group relative h-9 cursor-ew-resize touch-none overflow-hidden rounded-lg outline-none select-none",
        "focus-visible:ring-1 focus-visible:ring-black/40 dark:focus-visible:ring-white/50",
        SURFACE,
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 transition-colors",
          draft !== null ? "bg-gray-200 dark:bg-[#46465a]" : PICKED,
        )}
        style={{ width: `${fraction * 100}%`, transition: `width ${glide}, background-color 150ms` }}
      />
      {/* the handle shows while it's hovered or dragged; otherwise the fill
          alone shows the value, and the label isn't crossed out by it */}
      <div
        className={cn(
          "absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-800 transition-opacity dark:bg-[#f5f5f5]",
          draft !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
        style={{ left: `clamp(6px, ${fraction * 100}%, calc(100% - 6px))`, transition: `left ${glide}, opacity 150ms` }}
      />
      <span className={cn("absolute left-2.5 top-1/2 -translate-y-1/2", LABEL, draft !== null && "text-gray-800 dark:text-[#f5f5f5]")}>
        {label}
      </span>
      <span
        className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] font-medium tabular-nums",
          draft !== null ? "text-gray-800 dark:text-[#f5f5f5]" : "text-gray-500 dark:text-[#9b9ba8]",
        )}
      >
        {format(shown)}
      </span>
    </div>
  );
}

function Swatches({
  label,
  colors,
  value,
  onPick,
  isDark,
  tint,
}: {
  label: string;
  colors: string[];
  value: string;
  onPick: (c: string) => void;
  isDark: boolean;
  // fill swatches show the pale shade a fill is drawn in
  tint?: boolean;
}) {
  return (
    <div className={cn(ROW, SURFACE)}>
      <span className={LABEL}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
        {colors.map((c) => {
          const color = tint ? fillColor(c, isDark) : themeColor(c, isDark);
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === value}
              title={colorName(c)}
              onClick={() => onPick(c)}
              className={cn(
                "size-4 rounded-[4px] transition-transform hover:scale-110",
                c === value && "ring-[1.5px] ring-gray-800 ring-offset-2 ring-offset-gray-50 dark:ring-[#f5f5f5] dark:ring-offset-[#2a2a33]",
              )}
              style={
                c === TRANSPARENT
                  ? { border: `1.5px dashed ${isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"}` }
                  : tint && c !== AUTO
                    ? { background: color, border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}` }
                    : { background: color }
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ label, title, on, onToggle }: { label: string; title: string; on: boolean; onToggle: () => void }) {
  return (
    // the whole row flips it, like the switch itself (which handles its own clicks)
    <div
      title={title}
      onClick={(e) => (e.target as HTMLElement).closest(".path-switch") === null && onToggle()}
      className={cn(ROW, SURFACE, "w-full cursor-pointer hover:bg-gray-100 dark:hover:bg-[#3c3c4a]")}
    >
      <span className={cn(LABEL, on && "text-gray-800 dark:text-[#f5f5f5]")}>{label}</span>
      <Switch checked={on} onCheckedChange={onToggle} label={label} className="mr-1.5" />
    </div>
  );
}

// Shown beside the canvas while shapes, arrows, drawings or text are
// selected, or a tool that makes one is on. Picking anything restyles the
// selection and becomes the style of the next one made.
export default function PropertiesPanel({
  value,
  onChange,
  title,
  sections,
  snap,
  isDark,
  className,
}: {
  value: PanelValue;
  onChange: (patch: Partial<PanelValue>) => void;
  // what's being styled: "Shape", "Arrow", "Drawing", "Text" or "Selection"
  title: string;
  // which parts apply: arrows and drawings have no fill, drawings no line
  // style either, text only a color and a size
  sections: { fill: boolean; sloppiness: boolean; edges: boolean; lines: boolean; fontSize: boolean };
  // the draw tool's "snap drawings to perfect shapes" switch (draw tool only)
  snap?: { on: boolean; onToggle: () => void };
  isDark: boolean;
  className?: string;
}) {
  return (
    <div
      data-properties-panel
      // clicks here mustn't reach the canvas, which would clear the selection
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "flex max-h-[calc(100vh-112px)] w-[244px] flex-col overflow-y-auto rounded-[14px] border px-3 pt-2.5 pb-1.5 backdrop-blur-xl [scrollbar-width:none]",
        // the same surface as the toolbar and the other floating controls,
        // with the sidebar's border color
        "border-gray-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]",
        "dark:border-[#2e2e3a] dark:bg-[#232329] dark:shadow-[0_2px_10px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <div className="mb-1 border-b border-gray-200 pb-2 text-[15px] font-semibold text-gray-800 dark:border-[#3c3c4a] dark:text-[#f5f5f5]">
        {title}
      </div>

      <Folder title="Color">
        <Swatches
          label={sections.lines ? "Stroke" : "Color"}
          colors={STROKE_COLORS}
          value={value.stroke}
          onPick={(stroke) => onChange({ stroke })}
          isDark={isDark}
        />
        {sections.fill && (
          <Swatches label="Fill" colors={FILL_COLORS} value={value.fill} onPick={(fill) => onChange({ fill })} isDark={isDark} tint />
        )}
        {sections.fill && value.fill !== TRANSPARENT && (
          <Segmented
            label="Pattern"
            value={value.fillStyle}
            onPick={(fillStyle) => onChange({ fillStyle })}
            options={[
              { value: "solid", title: "Solid", text: "Solid" },
              { value: "dots", title: "Dots", text: "Dots" },
              { value: "stripes", title: "Stripes", text: "Stripes" },
            ]}
          />
        )}
      </Folder>

      {sections.fontSize && (
        <Folder title="Text">
          <Segmented
            label="Size"
            value={value.fontSize}
            onPick={(fontSize) => onChange({ fontSize })}
            options={[
              { value: 14, title: "Small", text: "S" },
              { value: 20, title: "Medium", text: "M" },
              { value: 28, title: "Large", text: "L" },
              { value: 36, title: "Extra large", text: "XL" },
            ]}
          />
        </Folder>
      )}

      {(sections.lines || snap) && (
        <Folder title="Stroke">
          {sections.lines && (
            <>
              <Slider
                label="Weight"
                value={value.strokeWidth}
                min={0.5}
                max={8}
                step={0.5}
                format={(v) => v.toFixed(1)}
                onCommit={(strokeWidth) => onChange({ strokeWidth })}
              />
              <Segmented
                label="Dash"
                value={value.strokeStyle}
                onPick={(strokeStyle) => onChange({ strokeStyle })}
                options={[
                  { value: "solid", title: "Solid", text: "Solid" },
                  { value: "dashed", title: "Dashed", text: "Dash" },
                  { value: "dotted", title: "Dotted", text: "Dot" },
                ]}
              />
            </>
          )}
          {sections.sloppiness && (
            <Segmented
              label="Line"
              // the nearest of the three (shapes can hold anything up to 3)
              value={value.roughness <= 0 ? 0 : value.roughness < 1.5 ? 1 : 2}
              onPick={(roughness) => onChange({ roughness })}
              options={[
                { value: 0, title: "Precise", text: "Precise" },
                { value: 1, title: "Hand-drawn", text: "Sketch" },
                { value: 2, title: "Loose and wobbly", text: "Sloppy" },
              ]}
            />
          )}
          {sections.edges && (
            <Segmented
              label="Edges"
              value={value.edges}
              onPick={(edges) => onChange({ edges })}
              options={[
                { value: "sharp", title: "Sharp corners", text: "Sharp" },
                { value: "round", title: "Rounded corners", text: "Round" },
              ]}
            />
          )}
          {sections.lines && (
            <Slider
              label="Opacity"
              value={value.opacity}
              min={0}
              max={100}
              step={5}
              format={(v) => `${v}%`}
              onCommit={(opacity) => onChange({ opacity })}
            />
          )}
          {snap && (
            <Toggle
              label="Snap to shapes"
              title="Turn a roughly drawn circle, box, triangle or line into a clean one"
              on={snap.on}
              onToggle={snap.onToggle}
            />
          )}
        </Folder>
      )}
    </div>
  );
}
