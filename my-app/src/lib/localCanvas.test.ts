import { describe, expect, it } from "vitest";
import { isLocalCanvas, parseCanvasFile, toCanvasFile, toRestorePayload, type LocalBlock } from "./localCanvas";
import type { RestorePayload } from "./restore";

const textBlock: RestorePayload = {
  type: "code",
  content: "hello",
  x: 10,
  y: 20,
  width: 300,
  language: "text",
  link: "https://example.com",
  wrapWidth: 240,
  fontSize: 18,
};

const drawing: RestorePayload = {
  type: "draw",
  content: JSON.stringify([{ x: 0, y: 0 }, { x: 5, y: 5 }]),
  x: 0,
  y: 0,
  width: 5,
  language: "javascript",
  link: null,
  wrapWidth: null,
  fontSize: null,
};

function fileWith(blocks: unknown[], extra: object = {}) {
  return JSON.stringify({ app: "free-form", version: 1, blocks, ...extra });
}

describe("canvas backup file", () => {
  it("reads back exactly what it wrote", () => {
    expect(parseCanvasFile(toCanvasFile([textBlock, drawing]))).toEqual([textBlock, drawing]);
  });

  it("keeps stacking positions, and reads backups made before they were saved", () => {
    const raised = { ...textBlock, zIndex: 1.7e12 };
    expect(parseCanvasFile(toCanvasFile([raised]))[0].zIndex).toBe(1.7e12);
    expect(parseCanvasFile(toCanvasFile([textBlock]))[0].zIndex).toBeUndefined();
  });

  it("reads an empty canvas", () => {
    expect(parseCanvasFile(toCanvasFile([]))).toEqual([]);
  });

  it("rejects files that aren't backups", () => {
    expect(() => parseCanvasFile("not json")).toThrow("isn't a free-form canvas backup");
    expect(() => parseCanvasFile(JSON.stringify({ blocks: [] }))).toThrow("isn't a free-form canvas backup");
    expect(() => parseCanvasFile(JSON.stringify([textBlock]))).toThrow("isn't a free-form canvas backup");
  });

  it("rejects backups from a newer version", () => {
    expect(() => parseCanvasFile(fileWith([], { version: 2 }))).toThrow("newer version");
  });

  it("names the first damaged block", () => {
    expect(() => parseCanvasFile(fileWith([textBlock, { ...drawing, x: "left" }]))).toThrow("block 2");
  });

  // Whatever is imported may later be uploaded on sign-up, so it has to pass
  // the server's restore validation too.
  it("rejects what the server would refuse", () => {
    const bad = [
      { ...textBlock, type: "script" },
      { ...textBlock, language: "ruby" },
      { ...textBlock, link: "javascript:alert(1)" },
      { ...textBlock, width: 0 },
      { ...textBlock, fontSize: 1000 },
      { ...textBlock, wrapWidth: 5 },
      { ...textBlock, x: Infinity },
      { ...textBlock, zIndex: -1 },
      { ...textBlock, zIndex: "top" },
    ];
    for (const block of bad) expect(() => parseCanvasFile(fileWith([block]))).toThrow("damaged");
  });

  it("refuses more blocks than a canvas can hold", () => {
    expect(() => parseCanvasFile(fileWith(Array(501).fill(textBlock)))).toThrow("full");
  });
});

describe("local rows", () => {
  it("map to what the restore route takes", () => {
    const row: LocalBlock = {
      id: "local-1",
      canvas_id: "local",
      type: "code",
      language: "python",
      content: "print(1)",
      x: 1,
      y: 2,
      width: 300,
      link: null,
      wrap_width: 200,
      font_size: null,
      seq: 1,
    };
    expect(toRestorePayload(row)).toEqual({
      type: "code",
      content: "print(1)",
      x: 1,
      y: 2,
      width: 300,
      language: "python",
      link: null,
      wrapWidth: 200,
      fontSize: null,
      // a row saved before stacking was stored falls back to its creation order
      zIndex: 1,
    });
    expect(toRestorePayload({ ...row, z_index: 50 }).zIndex).toBe(50);
  });

  it("only the local id counts as the browser canvas", () => {
    expect(isLocalCanvas("local")).toBe(true);
    expect(isLocalCanvas("3f1c0a7e-0000-4000-8000-000000000000")).toBe(false);
    expect(isLocalCanvas(undefined)).toBe(false);
  });
});
