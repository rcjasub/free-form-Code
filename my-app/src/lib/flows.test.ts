import { describe, expect, it } from "vitest";
import { diagramArrows, playableFlows, sectionBoxes, stepView } from "./flows";
import { DEFAULT_ARROW, DEFAULT_SHAPE, serializeArrow, serializeShape } from "./shapes";

// A flow's steps name sections; on the canvas they're boxes and arrows.

const REPO = { url: "https://github.com/acme/shop", commitSha: "a".repeat(40) };
const OTHER = { url: "https://github.com/acme/other", commitSha: "b".repeat(40) };
const box = (id: string, sectionId: string, repo = REPO) => ({
  id,
  type: "shape",
  content: serializeShape({ ...DEFAULT_SHAPE, meta: { sectionId, summary: "", files: [], repo } }),
});
const arrow = (id: string, fromId?: string, toId?: string) => ({ id, type: "arrow", content: serializeArrow({ ...DEFAULT_ARROW, fromId, toId }) });

const nodes = [
  box("b-web", "web"),
  box("b-api", "api"),
  box("b-db", "db"),
  box("x-api", "api", OTHER), // another repo's diagram
  { id: "plain", type: "shape", content: serializeShape(DEFAULT_SHAPE) },
  arrow("a1", "b-web", "b-api"),
  arrow("a2", "b-db", "b-api"), // drawn the other way round
  arrow("a3", "plain", "b-api"),
];

describe("flows on the canvas", () => {
  const boxes = sectionBoxes(nodes, REPO);

  it("finds each section's box in this repo's diagram only", () => {
    expect(Object.fromEntries(boxes)).toEqual({ web: "b-web", api: "b-api", db: "b-db" });
  });

  it("a step lights its boxes and the arrow between them, either way round", () => {
    expect(stepView({ from: "web", to: "api", text: "" }, boxes, nodes)).toEqual({ boxes: ["b-web", "b-api"], target: "b-api", arrow: "a1" });
    expect(stepView({ from: "api", to: "db", text: "" }, boxes, nodes)).toEqual({ boxes: ["b-api", "b-db"], target: "b-db", arrow: "a2" });
    // inside one section
    expect(stepView({ from: "api", to: "api", text: "" }, boxes, nodes)).toEqual({ boxes: ["b-api"], target: "b-api", arrow: null });
    expect(stepView({ from: "web", to: "gone", text: "" }, boxes, nodes)).toBeNull();
  });

  it("skips steps whose boxes are gone, and flows left with none", () => {
    const flows = [
      { title: "Order", steps: [{ from: "web", to: "api", text: "1" }, { from: "api", to: "queue", text: "2" }] },
      { title: "Gone", steps: [{ from: "queue", to: "mail", text: "x" }] },
    ];
    expect(playableFlows(flows, boxes)).toEqual([{ title: "Order", steps: [{ from: "web", to: "api", text: "1" }] }]);
  });

  it("knows which arrows join two diagram boxes", () => {
    expect([...diagramArrows(nodes)].sort()).toEqual(["a1", "a2"]);
  });
});
