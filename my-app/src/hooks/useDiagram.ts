import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { Mode } from "../App";
import type { Point } from "../components/DrawingNode";
import type { CanvasNode, HistoryEntry } from "./useCanvasHistory";
import { useResolvedArrows } from "./useResolvedArrows";
import { draftToBlock, isShapeTool, shapeIdAt, useShapeTool, type ShapeDraft } from "./useShapeTool";
import {
  DEFAULT_STYLE,
  parseArrow,
  parseShape,
  serializeArrow,
  serializeShape,
  type DiagramStyle,
  type ElementStyle,
} from "../lib/shapes";
import { parseDrawing, serializeDrawing, type DrawStyle } from "../lib/points";
import { canvasSizeOf, centeredIn, focusText, textsInsideShapes } from "../lib/containment";
import { FONT_SIZE, LINE_HEIGHT } from "../lib/splitLines";
import { AUTO } from "../lib/colors";

// What the properties panel edits: the diagram style, plus a text block's
// font size.
export type PanelValue = DiagramStyle & { fontSize: number };

export type NewBlock = NonNullable<ReturnType<typeof draftToBlock>>;

interface Options {
  enabled: boolean; // false for viewers who can't edit
  nodes: CanvasNode[];
  nodesRef: React.RefObject<CanvasNode[]>;
  selectedIds: string[];
  select: (ids: string[]) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  toCanvas: (clientX: number, clientY: number) => Point;
  // saves a block's new position + content; done=false for in-between frames
  reshapeBlock: (id: string, x: number, y: number, content: string, done: boolean) => void;
  // saves a new block (and records its undo step); resolves to its id
  createBlock: (block: NewBlock) => Promise<string | null>;
  // makes a text block at canvas (x, y) with the caret in it; resolves to its id
  createText: (x: number, y: number, content: string) => Promise<string | null>;
  moveNode: (id: string, x: number, y: number, record?: boolean) => void;
  // a text block's color (null: the theme's) and size; they don't record
  // undo themselves, `record` does
  applyColor: (id: string, color: string | null) => void;
  applySize: (id: string, wrapWidth: number | null, fontSize: number | null) => void;
  record: (entry: HistoryEntry) => void;
  deleteNode: (id: string, record?: boolean) => void;
  getScale: () => number;
}

// the block types the properties panel styles
const STYLED = new Set(["shape", "arrow", "draw"]);

function pick<T extends object>(o: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k))) as Partial<T>;
}

function isInEditor(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return el?.tagName === "TEXTAREA" || el?.tagName === "INPUT" || !!el?.isContentEditable;
}

// Everything the diagram tools need on a canvas page: the style new shapes
// get, the drag that makes one, arrows resolved onto their shapes, the
// properties panel's state, text in shapes, arrow labels, and tool lock. Both canvas pages
// use it, so they behave the same.
export function useDiagram({
  enabled,
  nodes,
  nodesRef,
  selectedIds,
  select,
  mode,
  setMode,
  toCanvas,
  reshapeBlock,
  createBlock,
  createText,
  moveNode,
  applyColor,
  applySize,
  record,
  deleteNode,
  getScale,
}: Options) {
  const [style, setStyle] = useState<DiagramStyle>(DEFAULT_STYLE);
  // the size new text gets (its color is style.stroke, like Excalidraw)
  const [textSize, setTextSize] = useState(FONT_SIZE);
  // Q keeps the shape tool on after each shape, to draw several in a row
  const [toolLocked, setToolLocked] = useState(false);
  // the shape/arrow whose label is being edited
  const [labelEditId, setLabelEditId] = useState<string | null>(null);
  // the shape an arrow end will attach to, outlined while one is dragged
  const [bindTargetId, setBindTargetId] = useState<string | null>(null);

  const isShapeId = useCallback(
    (id: string) => nodesRef.current.some((n) => n.id === id && n.type === "shape"),
    [nodesRef],
  );
  const shapeTool = useShapeTool({ toCanvas, isShape: isShapeId });
  const arrows = useResolvedArrows(nodes);

  // every drawing's style, kept in a map so each DrawingNode gets the same
  // object until its own content changes (React.memo relies on that)
  const drawStyles = useMemo(() => {
    const map = new Map<string, DrawStyle>();
    for (const n of nodes) if (n.type === "draw") map.set(n.id, parseDrawing(n.content).style);
    return map;
  }, [nodes]);
  // what the next freehand line is drawn with
  const drawStyle = useMemo<DrawStyle>(
    () => ({ stroke: style.stroke, strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle, opacity: style.opacity }),
    [style.stroke, style.strokeWidth, style.strokeStyle, style.opacity],
  );

  // the selected shapes, arrows and drawings, which the panel edits
  const selectedElements = useMemo(
    () => nodes.filter((n) => selectedIds.includes(n.id) && STYLED.has(n.type ?? "")),
    [nodes, selectedIds],
  );

  // the selected plain text blocks (not code), whose color and size it edits
  const selectedTexts = useMemo(
    () => nodes.filter((n) => selectedIds.includes(n.id) && !n.type && n.language === "text"),
    [nodes, selectedIds],
  );

  // The panel shows the first selected block's style (or, with none
  // selected, the style the next shape or text will get). Whatever a block
  // doesn't have (an arrow's fill, a shape's font size) shows the current one.
  const panelStyle = useMemo<PanelValue>(() => {
    const current = { ...style, fontSize: textSize };
    const first = selectedElements[0];
    const text = selectedTexts[0];
    if (first?.type === "shape") return { ...current, ...parseShape(first.content) };
    if (first?.type === "draw") return { ...current, ...parseDrawing(first.content).style };
    if (first?.type === "arrow") return { ...current, ...parseArrow(first.content) };
    if (text) return { ...current, stroke: text.color ?? AUTO, fontSize: text.fontSize ?? FONT_SIZE };
    return current;
  }, [selectedElements, selectedTexts, style, textSize]);

  // what's selected — or, with nothing selected, what the tool will make
  const selecting = selectedElements.length + selectedTexts.length > 0;
  const kinds: string[] = selecting
    ? [...selectedElements.map((n) => n.type ?? ""), ...(selectedTexts.length ? ["text"] : [])]
    : isShapeTool(mode)
      ? [mode === "arrow" ? "arrow" : "shape"]
      : mode === "draw" || mode === "text"
        ? [mode]
        : [];
  const panelVisible = enabled && kinds.length > 0;
  // what the panel's header calls it: one kind by name, a mix as "Selection"
  const KIND_TITLES: Record<string, string> = { shape: "Shape", arrow: "Arrow", draw: "Drawing", text: "Text" };
  const distinct = [...new Set(kinds)];
  const panelTitle = distinct.length === 1 ? (KIND_TITLES[distinct[0]] ?? "Style") : "Selection";
  // which parts of the panel apply to those
  const panelSections = {
    fill: kinds.includes("shape"),
    sloppiness: kinds.includes("shape") || kinds.includes("arrow"),
    // a rectangle's or diamond's corners (an ellipse has none)
    edges: selecting
      ? selectedElements.some((n) => n.type === "shape" && parseShape(n.content).kind !== "ellipse")
      : mode === "rect" || mode === "diamond",
    lines: kinds.some((k) => k !== "text"), // stroke width/style, opacity
    fontSize: kinds.includes("text"),
  };

  // Restyles the selection and becomes the style of the next shape or text.
  function changeStyle(patch: Partial<PanelValue>) {
    const { fontSize, ...diagram } = patch;
    if (Object.keys(diagram).length) setStyle((prev) => ({ ...prev, ...diagram }));
    if (fontSize !== undefined) setTextSize(fontSize);
    // arrows take everything but the fill; drawings only the stroke settings
    const element = pick(diagram, ["stroke", "strokeWidth", "strokeStyle", "opacity", "roughness"]) as Partial<ElementStyle>;
    const draw = pick(diagram, ["stroke", "strokeWidth", "strokeStyle", "opacity"]) as Partial<DrawStyle>;
    for (const n of selectedElements) {
      if (n.type === "shape" && Object.keys(diagram).length) {
        reshapeBlock(n.id, n.x, n.y, serializeShape({ ...parseShape(n.content), ...diagram }), true);
      } else if (n.type === "arrow" && Object.keys(element).length) {
        reshapeBlock(n.id, n.x, n.y, serializeArrow({ ...parseArrow(n.content), ...element }), true);
      } else if (n.type === "draw" && Object.keys(draw).length) {
        const { points, style: current } = parseDrawing(n.content);
        if (points) reshapeBlock(n.id, n.x, n.y, serializeDrawing(points, { ...current, ...draw }), true);
      }
    }
    // text: the stroke color is its color; the default size is stored as null
    for (const n of selectedTexts) {
      if (diagram.stroke !== undefined) {
        record({ kind: "color", id: n.id, color: n.color ?? null });
        applyColor(n.id, diagram.stroke === AUTO ? null : diagram.stroke);
      }
      if (fontSize !== undefined) {
        record({ kind: "resize", id: n.id, wrapWidth: n.wrapWidth ?? null, fontSize: n.fontSize ?? null, x: n.x, y: n.y });
        applySize(n.id, n.wrapWidth ?? null, fontSize === FONT_SIZE ? null : fontSize);
      }
    }
  }


  // A shape tool's drag was released: save it, then (unless the tool is
  // locked) go back to select with the new shape or arrow selected.
  async function finishShape(draft: ShapeDraft) {
    if (!toolLocked) setMode("select");
    const block = draftToBlock(draft, style);
    if (!block) return;
    const id = await createBlock(block);
    // A new shape comes out selected (so Enter or a double-click puts text
    // in it), not with text already started: drawing a shape mustn't leave
    // an empty text block behind.
    if (id && !toolLocked) select([id]);
  }

  // Picking a tool that makes something clears the selection, so the panel
  // styles the next thing made, not something still selected from before.
  const makesSomething = isShapeTool(mode) || mode === "draw" || mode === "text";
  useEffect(() => {
    if (makesSomething) select([]);
  }, [makesSomething, select]);

  // --- text in shapes ---------------------------------------------------
  // Text in a shape is an ordinary text block of its own: it can be selected,
  // restyled and dragged anywhere. It just starts centered in the shape, and
  // rides along while it sits inside one that's dragged (ridersOf).

  // the text block just made for a shape, centered once its typing is done
  const shapeText = useRef<{ textId: string; shapeId: string } | null>(null);
  // The page's functions, as of its last render. addShapeText and
  // textEditingChanged read them from here so they can stay the same
  // functions across renders (the blocks they're passed to are memoized).
  const page = useRef({ createText, reshapeBlock, moveNode, deleteNode, getScale, applyColor, applySize, style, textSize });
  useEffect(() => {
    page.current = { createText, reshapeBlock, moveNode, deleteNode, getScale, applyColor, applySize, style, textSize };
  });

  // A text block just made (text tool, or text in a shape) takes the color
  // and size picked in the panel. Not an undo step of its own: undoing the
  // block's creation covers it.
  const styleNewText = useCallback((id: string) => {
    const { applyColor, applySize, style, textSize } = page.current;
    if (style.stroke !== AUTO) applyColor(id, style.stroke);
    if (textSize !== FONT_SIZE) applySize(id, null, textSize);
  }, []);

  // Double-click / Enter on a shape, or a shape just drawn: edit the text
  // already in it, or start a new text block in its middle. A label from
  // before text was its own block becomes one here.
  const addShapeText = useCallback(async (shapeId: string) => {
    const { createText, reshapeBlock } = page.current;
    const shape = nodesRef.current.find((n) => n.id === shapeId);
    if (!shape) return;
    const inside = textsInsideShapes([shapeId], nodesRef.current);
    if (inside.length && focusText(inside[0])) return;
    const data = parseShape(shape.content);
    // starts at the middle and grows to the right while typing; centered after
    const textId = await createText(shape.x + data.w / 2 - 4, shape.y + data.h / 2 - LINE_HEIGHT / 2, data.label);
    if (!textId) return;
    styleNewText(textId);
    shapeText.current = { textId, shapeId };
    if (data.label) reshapeBlock(shapeId, shape.x, shape.y, serializeShape({ ...data, label: "" }), true);
  }, [nodesRef, styleNewText]);

  // Pass a text block's editing changes through here: when the one made for
  // a shape stops being edited, it's centered in the shape, or removed if
  // nothing was typed.
  const textEditingChanged = useCallback((editing: boolean) => {
    const { moveNode, deleteNode, getScale } = page.current;
    const pending = shapeText.current;
    if (editing || !pending) return;
    shapeText.current = null;
    const text = nodesRef.current.find((n) => n.id === pending.textId);
    const shape = nodesRef.current.find((n) => n.id === pending.shapeId);
    if (!text) return;
    if (!text.content.trim()) {
      deleteNode(text.id, false);
      return;
    }
    const size = canvasSizeOf(text.id, getScale());
    if (!shape || !size) return;
    const { w, h } = parseShape(shape.content);
    const at = centeredIn({ x: shape.x, y: shape.y, w, h }, size.w, size.h);
    moveNode(text.id, at.x, at.y, false);
  }, [nodesRef]);

  // The text blocks that move with these blocks: any sitting inside a shape
  // among them (and not already being moved).
  const ridersOf = useCallback(
    (ids: string[]) => textsInsideShapes(ids, nodesRef.current).filter((id) => !ids.includes(id)),
    [nodesRef],
  );

  // Pointer down on the canvas: starts a shape drag if a shape tool is on.
  // Shapes start on empty canvas; an arrow can also start on a shape.
  // Returns whether it took the event.
  function startShape(e: React.PointerEvent, onBackground: boolean) {
    if (!enabled || !isShapeTool(mode) || e.button !== 0) return false;
    const onShape = mode === "arrow" && !!shapeIdAt(e.clientX, e.clientY, isShapeId);
    if (onBackground || onShape) shapeTool.start(e, mode, finishShape);
    return true;
  }

  const setLabelEditing = useCallback((id: string, editing: boolean) => {
    setLabelEditId((current) => (editing ? id : current === id ? null : current));
  }, []);

  // Enter edits the selected shape's or arrow's label; Q locks the tool.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!enabled || isInEditor(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const only = selectedElements.length === 1 ? selectedElements[0] : null;
    if (e.key === "Enter" && only && only.type !== "draw") {
      e.preventDefault();
      if (only.type === "shape") addShapeText(only.id);
      else setLabelEditId(only.id);
    } else if (e.key === "q" || e.key === "Q") {
      setToolLocked((v) => !v);
    }
  });
  useEffect(() => {
    const handle = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  return {
    style,
    panelStyle,
    panelVisible,
    panelSections,
    panelTitle,
    styleNewText,
    drawStyles,
    drawStyle,
    changeStyle,
    draft: shapeTool.draft,
    startShape,
    arrows,
    isShapeId,
    labelEditId,
    setLabelEditing,
    bindTargetId: shapeTool.draft?.tool === "arrow" ? (shapeTool.draft.toId ?? null) : bindTargetId,
    setBindTargetId,
    addShapeText,
    textEditingChanged,
    ridersOf,
    toolLocked,
    toggleToolLock: () => setToolLocked((v) => !v),
  };
}
