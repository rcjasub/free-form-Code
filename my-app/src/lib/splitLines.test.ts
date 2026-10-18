import { describe, expect, test } from "vitest";
import { splitLines, LINE_GAP, LINE_HEIGHT } from "./splitLines";
import { detectLanguage } from "./detectLanguage";

// every character 10px wide
const measure = (s: string) => s.length * 10;
const step = LINE_HEIGHT + LINE_GAP;

describe("splitLines", () => {
  test("one block per line, stacked", () => {
    expect(splitLines("a\r\nb\nc", 480, measure)).toEqual([
      { content: "a", dx: 0, dy: 0, wrapWidth: null },
      { content: "b", dx: 0, dy: step, wrapWidth: null },
      { content: "c", dx: 0, dy: 2 * step, wrapWidth: null },
    ]);
  });

  test("blank lines leave a single gap, however many there are", () => {
    const pieces = splitLines("a\n\n\n\nb", 480, measure);
    expect(pieces.map((p) => p.dy)).toEqual([0, 2 * step]);
  });

  test("indentation becomes an offset to the right", () => {
    const pieces = splitLines("if (x) {\n  y();\n\tz();\n}", Infinity, measure);
    expect(pieces.map((p) => [p.content, p.dx])).toEqual([["if (x) {", 0], ["y();", 20], ["z();", 40], ["}", 0]]);
  });

  test("only a line too wide wraps, and the next one goes below all its rows", () => {
    // 11 chars per word + space: two words fit in 250px, the third wraps
    const pieces = splitLines("aaaaaaaaaa bbbbbbbbbb cccccccccc\nd", 250, measure);
    expect(pieces[0].wrapWidth).toBe(250);
    expect(pieces[1]).toEqual({ content: "d", dx: 0, dy: 2 * LINE_HEIGHT + LINE_GAP, wrapWidth: null });
  });
});

describe("detectLanguage", () => {
  test.each([
    ["public class Main {\n  public static void main(String[] args) {}\n}", "java"],
    ["#include <iostream>\nint main() {}", "cpp"],
    ["def add(a, b):\n    return a + b", "python"],
    ["import os", "python"],
    ["const x = [1, 2].map((n) => n * 2);", "javascript"],
    ["import { a } from './a';", "javascript"],
    ["if (ready) {\n  go();\n}", "javascript"],
  ])("%s → %s", (text, language) => {
    expect(detectLanguage(text)).toBe(language);
  });

  test("prose and lists stay plain text", () => {
    expect(detectLanguage("Buy milk\nCall mom\nFinish the essay")).toBe("text");
    expect(detectLanguage("- eggs\n- flour; sugar\n- butter")).toBe("text");
    expect(detectLanguage("let me know what you think: tomorrow works.")).toBe("text");
  });
});
