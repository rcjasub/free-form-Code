// "Split into lines" (right-click a text block): one block per line,
// stacked where the lines were, so a pasted list or a few paragraphs become
// pieces you can move around (like Excalidraw's pasted text). Each line
// keeps its indentation as an offset to the right, and blank lines leave a
// one-line gap however many there were.

// FloatingNode's default font size and its .cm-line line height
export const FONT_SIZE = 14;
export const LINE_HEIGHT = FONT_SIZE * 1.625;
// space between one block and the next
export const LINE_GAP = 10;
// CodeMirror's default tab width, in spaces
const TAB = "    ";

export interface SplitLine {
  content: string;
  dx: number; // how far right of the block's left edge (its indentation)
  dy: number; // how far below the block's top
  wrapWidth: number | null; // only lines too wide for maxWidth wrap
}

// How many rows a line takes once it wraps at maxWidth, breaking between
// words like CodeMirror does. An estimate — it only sets the gaps.
function rowCount(line: string, maxWidth: number, measure: (s: string) => number) {
  let rows = 1;
  let row = "";
  for (const word of line.split(/(?<=\s)/)) {
    if (row && measure((row + word).trimEnd()) > maxWidth) {
      rows++;
      row = word;
    } else {
      row += word;
    }
  }
  return rows;
}

// Lays out text at the default font size; maxWidth is where lines wrap
// (Infinity: they don't).
export function splitLines(text: string, maxWidth: number, measure: (s: string) => number): SplitLine[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const pieces: SplitLine[] = [];
  let dy = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      if (lines[i - 1]?.trim()) dy += LINE_HEIGHT + LINE_GAP;
      return;
    }
    const dx = measure(raw.slice(0, raw.length - raw.trimStart().length).replace(/\t/g, TAB));
    const room = maxWidth - dx;
    const wraps = measure(line) > room;
    pieces.push({ content: line, dx, dy, wrapWidth: wraps ? room : null });
    dy += (wraps ? rowCount(line, room, measure) : 1) * LINE_HEIGHT + LINE_GAP;
  });
  return pieces;
}

// Measures text in the canvas font (Excalifont), at the default size.
let ctx: CanvasRenderingContext2D | null | undefined;
export function measureCanvasText(s: string) {
  if (ctx === undefined) {
    ctx = document.createElement("canvas").getContext("2d");
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-canvas");
    if (ctx) ctx.font = `${FONT_SIZE}px ${family || "monospace"}`;
  }
  return ctx ? ctx.measureText(s).width : s.length * FONT_SIZE * 0.6;
}
