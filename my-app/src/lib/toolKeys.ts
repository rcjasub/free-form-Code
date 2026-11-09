import type { Mode } from "../App";

// Each tool's keyboard shortcuts: a letter, and for the main tools a number
// key in toolbar order (shown in the corner of its button).
export const TOOL_KEYS: Partial<Record<Mode, string[]>> = {
  hand: ["H"],
  select: ["V", "1"],
  rect: ["R", "2"],
  diamond: ["G", "3"],
  ellipse: ["O", "4"],
  arrow: ["A", "5"],
  draw: ["D", "6"],
  text: ["T", "7"],
  erase: ["E", "0"],
};

// The tool a key switches to, if any (callers skip this inside editors).
export function toolForKey(key: string): Mode | undefined {
  const k = key.toUpperCase();
  return (Object.keys(TOOL_KEYS) as Mode[]).find((m) => TOOL_KEYS[m]?.includes(k));
}
