import { describe, expect, it } from "vitest";
import { connectionsOf, fileLink, focusOf, kindsOnCanvas, selectedSection, shapesOnCanvas } from "./sectionDetails";
import { DEFAULT_ARROW, DEFAULT_SHAPE, parseShape, serializeArrow, serializeShape } from "./shapes";

// A diagram box's details card: which box it's about, its links and its
// connections, all worked out from the blocks on the page.

const REPO = { url: "https://github.com/acme/shop", commitSha: "c".repeat(40) };
const box = (id: string, label: string, meta?: object) => ({
  id,
  type: "shape",
  content: serializeShape({ ...DEFAULT_SHAPE, label, ...(meta && { meta: { sectionId: id, summary: `${label}.`, files: [], ...meta } }) }),
});
const arrow = (id: string, fromId?: string, toId?: string, label?: string) => ({
  id,
  type: "arrow",
  content: serializeArrow({ ...DEFAULT_ARROW, fromId, toId, ...(label && { label }) }),
});

const nodes = [
  box("web", "Storefront", { kind: "frontend" }),
  box("api", "Shop API", { kind: "backend", repo: REPO, files: ["api/", "api/server.ts"] }),
  box("db", "Postgres", { kind: "db" }),
  box("plain", "Drawn by hand"),
  { id: "note", content: "a text block" },
  arrow("a1", "web", "api", "REST"),
  arrow("a2", "api", "db", "SQL"),
  arrow("a3", "api", undefined, "loose end"),
  arrow("a4", "api", "gone", "to a deleted box"),
];

describe("selectedSection", () => {
  it("is the one selected box, if the AI made it", () => {
    expect(selectedSection(["api"], nodes)).toMatchObject({ id: "api", shape: { label: "Shop API" }, meta: { kind: "backend", repo: REPO } });
  });

  it("is nothing for several blocks, a hand-drawn box, an arrow or text", () => {
    expect(selectedSection(["api", "db"], nodes)).toBeNull();
    expect(selectedSection([], nodes)).toBeNull();
    expect(selectedSection(["plain"], nodes)).toBeNull();
    expect(selectedSection(["a1"], nodes)).toBeNull();
    expect(selectedSection(["note"], nodes)).toBeNull();
  });
});

describe("connectionsOf", () => {
  it("lists the boxes at the other ends, outgoing then incoming", () => {
    expect(connectionsOf("api", nodes)).toEqual([
      { shapeId: "db", title: "Postgres", via: "SQL", direction: "out" },
      { shapeId: "web", title: "Storefront", via: "REST", direction: "in" },
    ]);
    expect(connectionsOf("plain", nodes)).toEqual([]);
  });
});

describe("fileLink", () => {
  it("links files and folders at the diagram's commit, encoding each part", () => {
    expect(fileLink(REPO, "api/server.ts")).toBe(`https://github.com/acme/shop/blob/${"c".repeat(40)}/api/server.ts`);
    expect(fileLink(REPO, "api/")).toBe(`https://github.com/acme/shop/tree/${"c".repeat(40)}/api`);
    expect(fileLink(REPO, "docs/my file#1.md")).toBe(`https://github.com/acme/shop/blob/${"c".repeat(40)}/docs/my%20file%231.md`);
  });
});

describe("what a box may carry", () => {
  const read = (meta: object) => parseShape(JSON.stringify({ ...DEFAULT_SHAPE, meta: { sectionId: "s", summary: "", files: [], ...meta } })).meta;

  it("keeps a known kind and a GitHub repo with a full commit", () => {
    expect(read({ kind: "db", repo: REPO })).toMatchObject({ kind: "db", repo: REPO });
  });

  it("drops anything else, since the repo ends up in links", () => {
    expect(read({ kind: "spaceship" })?.kind).toBeUndefined();
    for (const url of ["javascript:alert(1)", "https://evil.com/acme/shop", "https://github.com/acme/shop/../../x", "https://github.com/acme"]) {
      expect(read({ repo: { url, commitSha: REPO.commitSha } })?.repo).toBeUndefined();
    }
    expect(read({ repo: { url: REPO.url, commitSha: "main" } })?.repo).toBeUndefined();
  });
});

describe("focusOf", () => {
  const at = (n: { id: string; type?: string; content: string }, x = 0, y = 0) => ({ ...n, x, y });
  const placed = nodes.map((n) => at(n));

  it("keeps the box, its arrows and the boxes at their other ends", () => {
    expect([...focusOf("api", placed)].sort()).toEqual(["a1", "a2", "a3", "a4", "api", "db", "gone", "web"].sort());
    expect([...focusOf("db", placed)].sort()).toEqual(["a2", "api", "db"]);
  });

  it("a group's frame also keeps the boxes inside it", () => {
    const frame = at({ id: "g", type: "shape", content: serializeShape({ ...DEFAULT_SHAPE, w: 400, h: 300, labelAlign: "top" }) }, 100, 100);
    const inside = at({ id: "in", type: "shape", content: serializeShape({ ...DEFAULT_SHAPE, w: 100, h: 50 }) }, 150, 160);
    const outside = at({ id: "out", type: "shape", content: serializeShape({ ...DEFAULT_SHAPE, w: 100, h: 50 }) }, 450, 160);
    expect([...focusOf("g", [frame, inside, outside])].sort()).toEqual(["g", "in"]);
    // a plain box doesn't hold what overlaps it
    const plain = at({ id: "p", type: "shape", content: serializeShape({ ...DEFAULT_SHAPE, w: 400, h: 300 }) }, 100, 100);
    expect([...focusOf("p", [plain, inside])]).toEqual(["p"]);
  });

  it("a group's frame keeps the arrows in and out of it, not the ones among its boxes", () => {
    const shape = (id: string, x: number, y: number, w = 100, h = 50) => at({ id, type: "shape", content: serializeShape({ ...DEFAULT_SHAPE, w, h }) }, x, y);
    const frame = at({ id: "g", type: "shape", content: serializeShape({ ...DEFAULT_SHAPE, w: 400, h: 300, labelAlign: "top" }) }, 100, 100);
    const blocks = [
      frame,
      shape("a", 150, 160),
      shape("b", 300, 160),
      shape("db", 700, 160),
      shape("far", 900, 160),
      at(arrow("among", "a", "b")),
      at(arrow("out", "b", "db")),
      at(arrow("beyond", "db", "far")),
    ];
    expect([...focusOf("g", blocks)].sort()).toEqual(["a", "b", "db", "g", "out"]);
  });
});

describe("kindsOnCanvas", () => {
  it("lists the kinds present, in the legend's order", () => {
    expect(kindsOnCanvas(nodes)).toEqual(["frontend", "backend", "db"]);
    expect(kindsOnCanvas([])).toEqual([]);
  });
});

describe("shapesOnCanvas", () => {
  it("lists the tile shapes with a meaning of their own, not plain tiles or frames", () => {
    const tile = (id: string, kind: "rect" | "ellipse" | "diamond", labelAlign: "below" | "top" = "below") => ({
      id,
      type: "shape",
      content: serializeShape({ ...DEFAULT_SHAPE, kind, labelAlign, meta: { sectionId: id, summary: "", files: [] } }),
    });
    expect(shapesOnCanvas([tile("a", "rect"), tile("b", "diamond"), tile("c", "ellipse")])).toEqual(["ellipse", "diamond"]);
    expect(shapesOnCanvas([tile("a", "rect"), tile("g", "diamond", "top")])).toEqual([]);
    // a hand-drawn circle isn't part of a diagram
    expect(shapesOnCanvas([{ id: "x", type: "shape", content: serializeShape({ ...DEFAULT_SHAPE, kind: "ellipse" }) }])).toEqual([]);
  });
});
