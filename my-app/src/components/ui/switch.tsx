import { useId } from "react";
import { cn } from "@/lib/utils";

// The path a switch's line runs along: two circles (where the knob rests,
// off and on) joined top and bottom. Its dashes are a single dot of line
// that travels from one circle to the other when the switch flips. See
// .path-switch in index.css.
const TRACK =
  "M 42.2496 0 A 42.24 42.24 90 0 0 0 42.2496 A 42.24 42.24 90 0 0 42.2496 84.4688 " +
  "A 42.24 42.24 90 0 0 84.4992 42.2496 A 42.24 42.24 90 0 0 42.2496 0 A 42.24 42.24 90 0 0 0 42.2496 " +
  "A 42.24 42.24 90 0 0 42.2496 84.4688 L 170.2496 84.4688 A 42.24 42.24 90 0 0 212.4992 42.2496 " +
  "A 42.24 42.24 90 0 0 170.2496 0 A 42.24 42.24 90 0 0 128 42.2496 A 42.24 42.24 90 0 0 170.2496 84.4688 " +
  "A 42.24 42.24 90 0 0 212.4992 42.2496 A 42.24 42.24 90 0 0 170.2496 0 L 42.2496 0";

// An on/off switch whose knob slides along a loop when flipped. A real
// checkbox underneath, so it works with the keyboard and screen readers;
// pass `label` to have one, or wrap it in a <label> of your own.
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("path-switch inline-flex", className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onCheckedChange(e.currentTarget.checked)}
        className="path-switch-input"
      />
      <label htmlFor={id} className="path-switch-track" aria-hidden>
        <svg viewBox="0 0 212.4992 84.4688" overflow="visible">
          <path pathLength={360} fill="none" stroke="currentColor" d={TRACK} />
        </svg>
      </label>
    </span>
  );
}
