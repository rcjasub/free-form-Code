import type { Point } from "../components/DrawingNode";

// Draw blocks keep their stroke as a JSON-encoded points array in `content`.
// That content can arrive from another client over the socket, so a malformed
// value must not throw: a throw inside a setNodes updater takes down the whole
// page, for everyone in the room. Returns null when it isn't a points array.
export function parsePoints(content: string): Point[] | null {
  try {
    const value: unknown = JSON.parse(content);
    if (!Array.isArray(value)) return null;
    const valid = value.every(
      (p) => typeof p === "object" && p !== null && Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    return valid ? (value as Point[]) : null;
  } catch {
    return null;
  }
}
