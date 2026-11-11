import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { Mode } from "../App";
import type { Point } from "../components/DrawingNode";
import type { CanvasNode, HistoryEntry } from "./useCanvasHistory";
import { useResolvedArrows } from "./useResolvedArrows";
import { draftToBlock, isShapeTool, shapeIdAt, useShapeTool, type ShapeDraft } from "./useShapeTool";
import {
  DEFAULT_STYLE,
  MAX_LABEL_LENGTH,
  parseArrow,
  parseShape,
  serializeArrow,
  serializeShape,
  shapeLabelSize,
  type DiagramStyle,
  type ElementStyle,
} from "../lib/shapes";
import { parseDrawing, serializeDrawing, type DrawStyle } from "../lib/points";
import { textsInsideShapes } from "../lib/containment";
import { bindBox } from "../lib/bindable";
import { FONT_SIZE } from "../lib/splitLines";
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
  // a text block's color (null: the theme's) and size; they don't record
  // undo themselves, `record` does
  applyColor: (id: string, color: string | null) => void;
  applySize: (id: string, wrapWidth: number | null, fontSize: number | null) => void;
  record: (entry: HistoryEntry) => void;
  deleteNode: (id: string, record?: boolean) => void;
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
  applyColor,
  applySize,
  record,
  deleteNode,
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
  // The box an arrow attaches to on a block, as of the page's state: a shape,
  // or a drawing snapped into a closed outline (lib/bindable).
  const bindBoxOf = useCallback(
    (id: string) => {
      const n = nodesRef.current.find((b) => b.id === id);
      return n ? bindBox(n) : null;
    },
    [nodesRef],
  );
  const isBindableId = useCallback((id: string) => !!bindBoxOf(id), [bindBoxOf]);
  // what the text tool and Enter type into: a shape's or an arrow's label
  const hasLabel = useCallback(
    (id: string) => nodesRef.current.some((n) => n.id === id && (n.type === "shape" || n.type === "arrow")),
    [nodesRef],
  );
  const shapeTool = useShapeTool({ toCanvas, isShape: isBindableId });
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
    if (first?.type === "shape") {
      const shape = parseShape(first.content);
      return { ...current, ...shape, fontSize: shapeLabelSize(shape) };
    }
    if (first?.type === "draw") return { ...current, ...parseDrawing(first.content).style };
    if (first?.type === "arrow") {
      const arrow = parseArrow(first.content);
      return { ...current, ...arrow, fontSize: shapeLabelSize(arrow) };
    }
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
    // text blocks, and a selected shape's or arrow's label
    fontSize: kinds.includes("text") || (selecting && (kinds.includes("shape") || kinds.includes("arrow"))),
  };

  // Restyles the selection and becomes the style of the next shape or text.
  function changeStyle(patch: Partial<PanelValue>) {
    const { fontSize, ...diagram } = patch;
    if (Object.keys(diagram).length) setStyle((prev) => ({ ...prev, ...diagram }));
    if (fontSize !== undefined) setTextSize(fontSize);
    // arrows take everything but the fill; drawings only the stroke settings
    const element = pick(diagram, ["stroke", "strokeWidth", "strokeStyle", "opacity", "roughness"]) as Partial<ElementStyle>;
    const draw = pick(diagram, ["stroke", "strokeWidth", "strokeStyle", "opacity"]) as Partial<DrawStyle>;
    // shapes and arrows take the font size for their labels
    const size = fontSize !== undefined ? { fontSize } : {};
    const shapePatch = { ...diagram, ...size };
    const arrowPatch = { ...element, ...size };
    for (const n of selectedElements) {
      if (n.type === "shape" && Object.keys(shapePatch).length) {
        reshapeBlock(n.id, n.x, n.y, serializeShape({ ...parseShape(n.content), ...shapePatch }), true);
      } else if (n.type === "arrow" && Object.keys(arrowPatch).length) {
        reshapeBlock(n.id, n.x, n.y, serializeArrow({ ...parseArrow(n.content), ...arrowPatch }), true);
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
  // A shape's text is its label: part of the shape, so it moves, resizes,
  // copies, deletes and undoes with it, and syncs as the shape's content. It's
  // typed right in the shape (ShapeNode). Text blocks only ride along with a
  // shape (ridersOf) when they sit in it: older canvases put text in shapes
  // that way, and editing such a shape's label folds that text in.

  // The page's functions, as of its last render. editShapeLabel and
  // styleNewText read them from here so they can stay the same functions
  // across renders (the blocks they're passed to are memoized).
  const page = useRef({ reshapeBlock, deleteNode, applyColor, applySize, style, textSize });
  useEffect(() => {
    page.current = { reshapeBlock, deleteNode, applyColor, applySize, style, textSize };
  });

  // A text block just made (text tool, or text in a shape) takes the color
  // and size picked in the panel. Not an undo step of its own: undoing the
  // block's creation covers it.
  const styleNewText = useCallback((id: string) => {
    const { applyColor, applySize, style, textSize } = page.current;
    if (style.stroke !== AUTO) applyColor(id, style.stroke);
    if (textSize !== FONT_SIZE) applySize(id, null, textSize);
  }, []);

  // Double-click / Enter on a shape: type in its label. A shape with no label
  // but plain text blocks sitting in it (how older canvases did it) takes
  // their text as its label first, and those blocks go.
  const editShapeLabel = useCallback((shapeId: string) => {
    const { reshapeBlock, deleteNode } = page.current;
    const shape = nodesRef.current.find((n) => n.id === shapeId && n.type === "shape");
    if (!shape) return;
    const data = parseShape(shape.content);
    if (!data.label) {
      const texts = textsInsideShapes([shapeId], nodesRef.current)
        .map((id) => nodesRef.current.find((n) => n.id === id))
        .filter((n): n is CanvasNode => !!n && n.language === "text" && !!n.content.trim())
        .sort((a, b) => a.y - b.y || a.x - b.x);
      if (texts.length) {
        const label = texts.map((n) => n.content.trim()).join("\n").slice(0, MAX_LABEL_LENGTH);
        reshapeBlock(shapeId, shape.x, shape.y, serializeShape({ ...data, label }), true);
        for (const n of texts) deleteNode(n.id);
      }
    }
    setLabelEditId(shapeId);
  }, [nodesRef]);

  // a shape's label finished being typed in (ShapeNode saves it)
  const endLabelEdit = useCallback((id: string) => {
    setLabelEditId((current) => (current === id ? null : current));
  }, []);

  // Type in a shape's or an arrow's label (the text tool, or Enter)
  const editLabel = useCallback(
    (id: string) => {
      if (isShapeId(id)) editShapeLabel(id);
      else if (hasLabel(id)) setLabelEditId(id);
    },
    [isShapeId, hasLabel, editShapeLabel],
  );


  // Pointer down on the canvas: starts a shape drag if a shape tool is on.
  // Shapes start on empty canvas; an arrow can also start on a shape.
  // Returns whether it took the event.
  function startShape(e: React.PointerEvent, onBackground: boolean) {
    if (!enabled || !isShapeTool(mode) || e.button !== 0) return false;
    const onShape = mode === "arrow" && !!shapeIdAt(e.clientX, e.clientY, isBindableId);
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
      if (only.type === "shape") editShapeLabel(only.id);
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
    isBindableId,
    bindBoxOf,
    hasLabel,
    editLabel,
    labelEditId,
    setLabelEditing,
    bindTargetId: shapeTool.draft?.tool === "arrow" ? (shapeTool.draft.toId ?? null) : bindTargetId,
    setBindTargetId,
    editShapeLabel,
    endLabelEdit,
    toolLocked,
    toggleToolLock: () => setToolLocked((v) => !v),
  };
}
