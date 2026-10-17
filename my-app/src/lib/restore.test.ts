import { describe, expect, test } from "vitest";
import { chunkForRestore, toRestorePayload, MAX_RESTORE_BLOCKS, MAX_RESTORE_BYTES, type RestorePayload } from "./restore";

const block = (content = "x"): RestorePayload => ({
  type: "code",
  content,
  x: 0,
  y: 0,
  width: 300,
  language: "text",
  link: null,
  wrapWidth: null,
  fontSize: null,
});

describe("toRestorePayload", () => {
  test("keeps a text block's language, link and size", () => {
    const p = toRestorePayload({ id: "b1", x: 5, y: 6, content: "hi", language: "python", link: "https://a.b", wrapWidth: 320, fontSize: 20 });
    expect(p).toEqual({ type: "code", content: "hi", x: 5, y: 6, width: 300, language: "python", link: "https://a.b", wrapWidth: 320, fontSize: 20 });
  });

  test("fills defaults for what a block doesn't have", () => {
    const p = toRestorePayload({ id: "b1", x: 0, y: 0, content: "" });
    expect(p).toMatchObject({ language: "javascript", link: null, wrapWidth: null, fontSize: null });
  });

  test("a drawing is as wide as its stroke", () => {
    const p = toRestorePayload({ id: "d1", x: 0, y: 0, content: "[]", type: "draw", points: [{ x: 0, y: 0 }, { x: 42, y: 3 }] });
    expect(p).toMatchObject({ type: "draw", width: 42 });
  });
});

describe("chunkForRestore", () => {
  test("keeps a small batch in one request", () => {
    expect(chunkForRestore([block(), block()])).toHaveLength(1);
  });

  test("splits by count at the route's limit", () => {
    const chunks = chunkForRestore(Array.from({ length: MAX_RESTORE_BLOCKS + 1 }, () => block()));
    expect(chunks.map((c) => c.length)).toEqual([MAX_RESTORE_BLOCKS, 1]);
  });

  test("splits by size so each request stays under the body limit", () => {
    const big = "a".repeat(MAX_RESTORE_BYTES / 2);
    const chunks = chunkForRestore([block(big), block(big), block(big)]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      if (c.length > 1) expect(JSON.stringify(c).length).toBeLessThanOrEqual(MAX_RESTORE_BYTES + 1000);
    }
  });

  test("a single block bigger than the limit still gets its own request", () => {
    const huge = block("a".repeat(MAX_RESTORE_BYTES + 10));
    expect(chunkForRestore([block(), huge, block()]).map((c) => c.length)).toEqual([1, 1, 1]);
  });

  test("keeps the original order", () => {
    const blocks = Array.from({ length: 5 }, (_, i) => block(String(i)));
    expect(chunkForRestore(blocks).flat().map((b) => b.content)).toEqual(["0", "1", "2", "3", "4"]);
  });
});
