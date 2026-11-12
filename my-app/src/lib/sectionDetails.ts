import { frameContents } from "./containment";
import { parseArrow, parseShape, type SectionMeta, type ShapeData } from "./shapes";

// What a diagram box's details card shows (Phase 2b): the section the AI
// described, its files on GitHub, and what it connects to on the canvas.
// Everything comes from blocks already on the page; nothing is fetched.

interface BlockLike {
  id: string;
  type?: string;
  content: string;
}

export interface SelectedSection {
  id: string;
  shape: ShapeData;
  meta: SectionMeta;
}

// The one selected block, if it's a box from an AI diagram.
export function selectedSection(selectedIds: readonly string[], nodes: readonly BlockLike[]): SelectedSection | null {
  if (selectedIds.length !== 1) return null;
  const node = nodes.find((n) => n.id === selectedIds[0]);
  if (!node || node.type !== "shape") return null;
  const shape = parseShape(node.content);
  return shape.meta ? { id: node.id, shape, meta: shape.meta } : null;
}

export interface Connection {
  // the box at the other end
  shapeId: string;
  title: string;
  // the arrow's label
  via: string;
  direction: "out" | "in";
}

// The arrows attached to a box, as the boxes at their other ends: outgoing
// first, then incoming, each in the order they're on the canvas. Arrows
// whose other end is loose or gone are left out.
export function connectionsOf(shapeId: string, nodes: readonly BlockLike[]): Connection[] {
  const titleOf = new Map(nodes.filter((n) => n.type === "shape").map((n) => [n.id, parseShape(n.content).label]));
  const out: Connection[] = [];
  const into: Connection[] = [];
  for (const node of nodes) {
    if (node.type !== "arrow") continue;
    const arrow = parseArrow(node.content);
    const via = arrow.label ?? "";
    if (arrow.fromId === shapeId && arrow.toId && arrow.toId !== shapeId && titleOf.has(arrow.toId)) {
      out.push({ shapeId: arrow.toId, title: titleOf.get(arrow.toId) || "Untitled", via, direction: "out" });
    } else if (arrow.toId === shapeId && arrow.fromId && arrow.fromId !== shapeId && titleOf.has(arrow.fromId)) {
      into.push({ shapeId: arrow.fromId, title: titleOf.get(arrow.fromId) || "Untitled", via, direction: "in" });
    }
  }
  return [...out, ...into];
}

// A file's (or, ending in "/", a folder's) page on GitHub at the commit the
// diagram was read from. The repo and commit were checked when the shape
// was read (parseShape), and each path segment is encoded.
export function fileLink(repo: { url: string; commitSha: string }, path: string): string {
  const isFolder = path.endsWith("/");
  const encoded = path.replace(/\/$/, "").split("/").map(encodeURIComponent).join("/");
  return `${repo.url}/${isFolder ? "tree" : "blob"}/${repo.commitSha}/${encoded}`;
}

export const KIND_NAMES: Record<NonNullable<SectionMeta["kind"]>, string> = {
  frontend: "Frontend",
  backend: "Backend",
  service: "Service",
  db: "Database",
  infra: "Infrastructure",
  external: "Outside service",
};

// What stays lit while a box is selected (the rest of the canvas dims): the
// box, the arrows attached to it, the boxes at their other ends and, for a
// group's frame, the boxes inside it. Follows one flow through a busy
// diagram.
export function focusOf(shapeId: string, nodes: readonly (BlockLike & { x: number; y: number })[]): Set<string> {
  const ids = new Set([shapeId]);
  for (const node of nodes) {
    if (node.type !== "arrow") continue;
    const { fromId, toId } = parseArrow(node.content);
    if (fromId === shapeId || toId === shapeId) {
      ids.add(node.id);
      if (fromId) ids.add(fromId);
      if (toId) ids.add(toId);
    }
  }
  for (const id of frameContents(shapeId, nodes)) ids.add(id);
  return ids;
}

// The kinds of AI-diagram boxes on the canvas, in the legend's order.
export function kindsOnCanvas(nodes: readonly BlockLike[]): NonNullable<SectionMeta["kind"]>[] {
  const present = new Set<string>();
  for (const node of nodes) {
    if (node.type !== "shape") continue;
    const kind = parseShape(node.content).meta?.kind;
    if (kind) present.add(kind);
  }
  return (Object.keys(KIND_NAMES) as NonNullable<SectionMeta["kind"]>[]).filter((k) => present.has(k));
}
