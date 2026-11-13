import { describe, expect, it } from "vitest";
import { dropTarget, frameContents, groupAfterDrop, movingWith } from "./containment";
import { DEFAULT_ARROW, DEFAULT_SHAPE, serializeArrow, serializeShape } from "./shapes";

// Group frames move as one: dragging a frame on its own brings what's
// inside it (shapes, nested frames, arrows between them).

const shape = (id: string, x: number, y: number, w: number, h: number, frame = false) => ({
  id,
  type: "shape",
  x,
  y,
  content: serializeShape({ ...DEFAULT_SHAPE, w, h, ...(frame && { labelAlign: "top" as const }) }),
});
const arrow = (id: string, fromId?: string, toId?: string) => ({ id, type: "arrow", x: 0, y: 0, content: serializeArrow({ ...DEFAULT_ARROW, fromId, toId }) });

const nodes = [
  shape("api", 100, 100, 500, 300, true),
  shape("auth", 130, 150, 120, 60),
  shape("jobs", 300, 150, 260, 200, true), // a frame inside the frame
  shape("queue", 320, 200, 100, 50),
  shape("db", 700, 150, 120, 60), // outside
  shape("half", 550, 350, 120, 60), // half in, half out
  arrow("auth-queue", "auth", "queue"),
  arrow("auth-db", "auth", "db"), // leaves the frame
  arrow("api-auth", "api", "auth"),
  arrow("loose", "auth"),
  { id: "text", x: 150, y: 160, content: "a note" },
];

describe("frameContents", () => {
  it("is the shapes wholly inside, nested frames' too, and arrows between them", () => {
    expect(frameContents("api", nodes).sort()).toEqual(["api-auth", "auth", "auth-queue", "jobs", "queue"]);
    expect(frameContents("jobs", nodes)).toEqual(["queue"]);
  });

  it("is nothing for a plain box, however much sits on it", () => {
    expect(frameContents("auth", nodes)).toEqual([]);
    expect(frameContents("db", [...nodes, shape("on-db", 710, 160, 20, 20)])).toEqual([]);
    expect(frameContents("missing", nodes)).toEqual([]);
  });
});

describe("groups that know their members", () => {
  // like `shape`, with the section meta and group an AI diagram gives each box
  const section = (id: string, group: string | null, x: number, y: number, w: number, h: number, frame = false) => ({
    id,
    type: "shape",
    x,
    y,
    content: serializeShape({
      ...DEFAULT_SHAPE,
      w,
      h,
      ...(frame && { labelAlign: "top" as const }),
      meta: { sectionId: `s-${id}`, summary: "", files: [] },
      group: group && `s-${group}`,
    }),
  });
  const diagram = [
    section("api", null, 100, 100, 500, 300, true),
    section("auth", "api", 130, 150, 120, 60),
    section("jobs", "api", 300, 150, 260, 200, true),
    section("queue", "jobs", 320, 200, 100, 50),
    // dragged under the frame, or drawn there: not one of its members
    section("db", null, 140, 300, 120, 60),
    shape("sketch", 450, 330, 40, 40),
    arrow("auth-queue", "auth", "queue"),
    arrow("auth-db", "auth", "db"),
  ];

  it("is its members and their members, not whatever it's over", () => {
    expect(frameContents("api", diagram).sort()).toEqual(["auth", "auth-queue", "jobs", "queue"]);
    expect(frameContents("jobs", diagram)).toEqual(["queue"]);
  });

  it("leaves behind a member dragged out of it, until it's put back", () => {
    const out = diagram.map((n) => (n.id === "auth" ? { ...n, x: 700 } : n));
    expect(frameContents("api", out).sort()).toEqual(["jobs", "queue"]);
  });

  it("a shape dropped in a frame joins the innermost one; dropped outside, it leaves", () => {
    // the sketch, dropped in the nested frame, then in the outer one only
    expect(dropTarget("sketch", 330, 280, diagram)?.id).toBe("jobs");
    expect(groupAfterDrop("sketch", 330, 280, diagram)).toBe("s-jobs");
    expect(groupAfterDrop("sketch", 130, 330, diagram)).toBe("s-api");
    // half in: not in
    expect(groupAfterDrop("sketch", 580, 330, diagram)).toBeUndefined();
    // a member dropped out leaves; dropped where it already belongs, nothing changes
    expect(groupAfterDrop("auth", 700, 150, diagram)).toBeNull();
    expect(groupAfterDrop("auth", 140, 160, diagram)).toBeUndefined();
  });

  it("a frame isn't dropped into itself or what it holds", () => {
    // "jobs" dropped where it is: inside "api", not inside itself
    expect(dropTarget("jobs", 300, 150, diagram)?.id).toBe("api");
    expect(dropTarget("api", 100, 100, diagram)).toBeNull();
  });
});

describe("movingWith", () => {
  it("a frame dragged on its own brings its contents", () => {
    expect(movingWith("api", [], nodes).sort()).toEqual(["api", "api-auth", "auth", "auth-queue", "jobs", "queue"]);
    expect(movingWith("api", ["api"], nodes)).toContain("queue");
  });

  it("a selection of several moves as selected, frame or not", () => {
    expect(movingWith("api", ["api", "db"], nodes)).toEqual(["api", "db"]);
  });

  it("anything else moves alone", () => {
    expect(movingWith("auth", [], nodes)).toEqual(["auth"]);
    expect(movingWith("db", ["auth", "queue"], nodes)).toEqual(["db"]);
  });
});
