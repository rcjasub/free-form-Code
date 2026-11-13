import { describe, expect, it } from "vitest";
import type { ArchitectureModel } from "../API/architecture";
import { layoutArchitecture } from "./architectureLayout";
import { diagramBlocks, introSchedule, labelSize, viewToFit } from "./architecturePlacement";
import { parseArrow, parseShape, pointAlong, resolveArrow, type ShapeBox } from "./shapes";

// Placing an AI-described architecture (Phase 2, step 7): the blocks it
// becomes, which must be ordinary, valid shapes and arrows that the canvas
// draws the way the layout planned.

const model: ArchitectureModel = {
  summary: "A web app.",
  sections: [
    { id: "web", title: "Web App", kind: "frontend", summary: "The UI.", files: ["web/"] },
    { id: "api", title: "Express API", kind: "backend", summary: "The server.", files: ["server.ts"] },
    { id: "auth", title: "Auth", kind: "backend", summary: "Sign-in.", files: ["auth.ts"], parentId: "api" },
    { id: "db", title: "Postgres", kind: "db", summary: "Storage.", files: [] },
    { id: "stripe", title: "Stripe", kind: "external", summary: "Payments.", files: [] },
  ],
  edges: [
    { from: "web", to: "api", label: "REST" },
    { from: "auth", to: "db", label: "users" },
    { from: "api", to: "stripe", label: "" },
  ],
};

const fixedSeed = () => 7;
const REPO = { url: "https://github.com/acme/shop", commitSha: "c".repeat(40) };

async function placed(origin = { x: 1000, y: 500 }) {
  const layout = await layoutArchitecture(model);
  return { layout, blocks: diagramBlocks(model, layout, origin, { seed: fixedSeed, repo: REPO }) };
}

describe("shapes", () => {
  it("one valid shape per section, parents first, carrying the section", async () => {
    const { blocks } = await placed();
    const order = blocks.shapes.map((s) => s.sectionId);
    expect([...order].sort()).toEqual(["api", "auth", "db", "stripe", "web"]);
    expect(order.indexOf("api")).toBeLessThan(order.indexOf("auth"));

    for (const { sectionId, block } of blocks.shapes) {
      const section = model.sections.find((s) => s.id === sectionId)!;
      // What the canvas reads back is what was written: nothing dropped as invalid.
      const shape = parseShape(block.content);
      expect(JSON.parse(block.content)).toEqual(JSON.parse(JSON.stringify(shape)));
      expect(block).toMatchObject({ type: "shape", width: shape.w, language: "javascript", link: null });
      expect(shape).toMatchObject({ kind: "rect", label: section.title, seed: 7 });
      expect(shape.meta).toEqual({ sectionId, summary: section.summary, files: section.files, kind: section.kind, repo: REPO });
      expect(shape.group).toBe(section.parentId ?? null);
    }
  });

  it("is placed at the origin, the layout's boxes moved there", async () => {
    const { layout, blocks } = await placed({ x: 1000, y: 500 });
    for (const box of layout.boxes) {
      const { block } = blocks.shapes.find((s) => s.sectionId === box.id)!;
      expect([block.x, block.y]).toEqual([1000 + box.x, 500 + box.y]);
    }
    expect(blocks.bounds).toEqual({ x: 1000, y: 500, w: layout.width, h: layout.height });
  });

  it("looks like its kind; a group is a dashed frame with its title on top", async () => {
    const { blocks } = await placed();
    const shape = (id: string) => parseShape(blocks.shapes.find((s) => s.sectionId === id)!.block.content);

    expect(shape("web")).toMatchObject({ stroke: "blue", fill: "blue", strokeStyle: "solid" });
    expect(shape("db")).toMatchObject({ stroke: "red", fill: "red" });
    expect(shape("stripe")).toMatchObject({ stroke: "auto", fill: "transparent", strokeStyle: "dashed" });
    expect(shape("auth").labelAlign).toBeUndefined();
    expect(shape("api")).toMatchObject({ stroke: "green", fill: "transparent", strokeStyle: "dashed", labelAlign: "top" });
  });
});

describe("arrows", () => {
  it("attach to the saved shapes, as the canvas would draw them", async () => {
    const { blocks } = await placed();
    const ids = new Map(blocks.shapes.map((s) => [s.sectionId, `block-${s.sectionId}`]));
    const arrows = blocks.arrows(ids);
    // web→api, auth→db, api→stripe: none from a group to its own child
    expect(arrows).toHaveLength(3);

    const boxes = new Map<string, ShapeBox>(
      blocks.shapes.map(({ sectionId, block }) => {
        const shape = parseShape(block.content);
        return [`block-${sectionId}`, { x: block.x, y: block.y, w: shape.w, h: shape.h, kind: "rect" }];
      }),
    );
    for (const block of arrows) {
      const arrow = parseArrow(block.content);
      expect(block.type).toBe("arrow");
      expect(arrow.fromId).toMatch(/^block-/);
      expect(arrow.toId).toMatch(/^block-/);
      expect(arrow.points[0]).toEqual({ x: 0, y: 0 });
      // Re-resolving against the shapes moves the ends by at most rounding:
      // the arrow doesn't jump the first time anything is drawn or moved.
      const resolved = resolveArrow(arrow, block.x, block.y, boxes);
      resolved.points.forEach((p, i) => {
        expect(Math.abs(p.x - arrow.points[i].x)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.y - arrow.points[i].y)).toBeLessThanOrEqual(1);
      });
    }
    expect(arrows.map((a) => parseArrow(a.content).label ?? "")).toEqual(["REST", "users", ""]);
  });

  it("an edge whose shape didn't save is left out", async () => {
    const { blocks } = await placed();
    const ids = new Map(blocks.shapes.filter((s) => s.sectionId !== "db").map((s) => [s.sectionId, `block-${s.sectionId}`]));
    const arrows = blocks.arrows(ids);
    expect(arrows).toHaveLength(2);
    expect(arrows.every((a) => parseArrow(a.content).toId !== "block-db")).toBe(true);
  });
});

describe("fitting the view", () => {
  it("shows the whole diagram, centered, in zoom steps", () => {
    const view = viewToFit({ x: 1000, y: 500, w: 2200, h: 540 }, { width: 1600, height: 900 });
    expect(view.scale).toBe(0.6);
    // the diagram's center lands in the screen's center
    expect(view.offset.x + (1000 + 1100) * view.scale).toBeCloseTo(800);
    expect(view.offset.y + (500 + 270) * view.scale).toBeCloseTo(450);
  });

  it("never zooms in past 100%, or out past 20%", () => {
    expect(viewToFit({ x: 0, y: 0, w: 200, h: 100 }, { width: 1600, height: 900 }).scale).toBe(1);
    expect(viewToFit({ x: 0, y: 0, w: 50_000, h: 100 }, { width: 1600, height: 900 }).scale).toBe(0.2);
  });
});

// The diagram Opus 5.5 drew for this repo, with its kinds: two groups and
// several arrows converging on the database, where labels used to collide.
const OPUS: ArchitectureModel = {
  summary: "free-form",
  sections: [
    ["web-app", "React Canvas App", "frontend"], ["api-client", "Axios API Client", "frontend", "web-app"],
    ["browser-storage", "Local Guest Canvas Storage", "db", "web-app"], ["nginx", "nginx Proxy", "infra"],
    ["api", "Express API Server", "backend"], ["auth", "Auth & Access Control", "backend", "api"],
    ["realtime", "Socket.IO Collaboration", "backend", "api"], ["code-worker", "Code Execution Worker", "service"],
    ["guest-cleanup", "Guest Cleanup Job", "service"], ["postgres", "PostgreSQL", "db"], ["redis", "Redis", "infra"],
    ["piston", "Piston Sandbox", "external"], ["ci", "GitHub Actions CI/CD", "infra"],
  ].map(([id, title, kind, parentId]) => ({ id, title, kind: kind as ArchitectureModel["sections"][number]["kind"], summary: "", files: [], ...(parentId && { parentId }) })),
  edges: [
    ["web-app", "nginx", "HTTP / WebSocket"], ["api-client", "api", "REST /api"], ["web-app", "realtime", "Socket.IO events"],
    ["nginx", "api", "proxies /api, /socket.io"], ["api", "postgres", "SQL via pg"], ["api", "redis", "cache get/set/del"],
    ["api", "code-worker", "enqueues run jobs (BullMQ)"], ["code-worker", "redis", "consumes queue"], ["code-worker", "piston", "HTTP execute"],
    ["code-worker", "realtime", "emits run:complete"], ["realtime", "postgres", "checks canvas access"], ["guest-cleanup", "postgres", "deletes idle guests"],
    ["auth", "postgres", "users queries"], ["ci", "api", "builds & pushes image"], ["ci", "nginx", "builds & pushes frontend image"],
  ].map(([from, to, label]) => ({ from, to, label })),
};

describe("arrow labels", () => {
  it("don't land on each other or on a box", async () => {
    const layout = await layoutArchitecture(OPUS);
    const blocks = diagramBlocks(OPUS, layout, { x: 0, y: 0 }, { seed: fixedSeed });
    const arrows = blocks.arrows(new Map(blocks.shapes.map((s) => [s.sectionId, `b-${s.sectionId}`])));

    type R = { x: number; y: number; w: number; h: number; name: string };
    const overlap = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const labels: R[] = arrows.flatMap((block) => {
      const arrow = parseArrow(block.content);
      if (!arrow.label) return [];
      expect(arrow.labelAt).toBeGreaterThanOrEqual(0.1);
      const c = pointAlong(arrow.points.map((p) => ({ x: p.x + block.x, y: p.y + block.y })), arrow.labelAt!);
      // the label as drawn, without the room around it
      const { w, h } = labelSize(arrow.label, arrow.fontSize ?? 14);
      return [{ x: c.x - (w - 6) / 2, y: c.y - (h - 6) / 2, w: w - 6, h: h - 6, name: arrow.label }];
    });
    const solid: R[] = layout.boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.isGroup ? 44 : b.h, name: b.id }));

    const clashes: string[] = [];
    labels.forEach((a, i) => {
      for (const b of labels.slice(i + 1)) if (overlap(a, b)) clashes.push(`${a.name} / ${b.name}`);
      for (const b of solid) if (overlap(a, b)) clashes.push(`${a.name} on ${b.name}`);
    });
    expect(labels).toHaveLength(15);
    expect(clashes).toEqual([]);
  });
});

describe("building in", () => {
  it("boxes go left to right (top first within a column, a frame before its contents), then the arrows", () => {
    const shapes = [{ x: 500, y: 0 }, { x: 0, y: 200 }, { x: 0, y: 0 }, { x: 24, y: 44 }];
    const arrows = [{ x: 300, y: 0 }, { x: 100, y: 0 }];
    const { shapeDelays, arrowDelays, totalMs } = introSchedule(shapes, arrows);
    // order: (0,0), (0,200), (24,44)... sorted by x then y
    expect(shapeDelays[2]).toBe(0);
    expect(shapeDelays[2]).toBeLessThan(shapeDelays[1]);
    expect(shapeDelays[1]).toBeLessThan(shapeDelays[3]);
    expect(shapeDelays[3]).toBeLessThan(shapeDelays[0]);
    expect(Math.min(...arrowDelays)).toBeGreaterThan(Math.max(...shapeDelays));
    expect(arrowDelays[1]).toBeLessThan(arrowDelays[0]);
    expect(totalMs).toBe(Math.max(...arrowDelays) + 600);
  });

  it("a big diagram builds faster per block, but takes no longer than a couple of seconds", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: 0 }));
    const { shapeDelays, arrowDelays, totalMs } = introSchedule(many, many.slice(0, 80));
    expect(Math.max(...shapeDelays)).toBeLessThanOrEqual(1400);
    expect(totalMs).toBeLessThan(3000);
    expect(arrowDelays.every((d) => d > 0)).toBe(true);
    expect(introSchedule([{ x: 0, y: 0 }], [])).toEqual({ shapeDelays: [0], arrowDelays: [], totalMs: 600 });
  });
});
