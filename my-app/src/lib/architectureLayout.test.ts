import { describe, expect, test } from "vitest";
import { estimateBoxSize, GROUP_HEADER, layoutArchitecture, layoutQuality, type LayoutModel, type SectionBox } from "./architectureLayout";

// The layout for AI-drawn diagrams (Phase 2, step 6): every section gets a
// box, nothing overlaps, nested sections sit inside their parent, and the
// diagram reads left to right along its edges.

// The diagram the AI drew for this repo (Sonnet 5.5, 2026-11-12).
const FREE_FORM: LayoutModel = {
  sections: [
    { id: "web-app", title: "React Web App" },
    { id: "api-client", title: "API & Socket Clients", parentId: "web-app" },
    { id: "nginx", title: "nginx Frontend Server" },
    { id: "api", title: "Express API" },
    { id: "models", title: "Data Models", parentId: "api" },
    { id: "realtime", title: "Socket.IO Realtime" },
    { id: "worker", title: "Code Execution Worker" },
    { id: "cleanup", title: "Guest Cleanup & Migrations" },
    { id: "postgres", title: "PostgreSQL" },
    { id: "redis", title: "Redis" },
    { id: "piston", title: "Piston Sandbox" },
    { id: "ci", title: "CI/CD & E2E Tests" },
  ],
  edges: [
    { from: "web-app", to: "api-client", label: "uses" },
    { from: "nginx", to: "web-app", label: "serves static build" },
    { from: "api-client", to: "nginx", label: "REST / WebSocket" },
    { from: "nginx", to: "api", label: "proxies /api" },
    { from: "nginx", to: "realtime", label: "proxies /socket.io" },
    { from: "api", to: "models", label: "queries" },
    { from: "models", to: "postgres", label: "SQL" },
    { from: "api", to: "redis", label: "caches data" },
    { from: "api", to: "worker", label: "enqueues run jobs" },
    { from: "worker", to: "redis", label: "reads jobs" },
    { from: "worker", to: "piston", label: "executes code" },
    { from: "worker", to: "realtime", label: "emits run results" },
    { from: "realtime", to: "models", label: "checks canvas access" },
    { from: "cleanup", to: "postgres", label: "migrates and deletes guests" },
  ],
};

// The diagram Opus 5.5 drew for this repo (2026-11-11): two groups.
const FREE_FORM_OPUS: LayoutModel = {
  sections: [
    { id: "web-app", title: "React Canvas App" },
    { id: "api-client", title: "Axios API Client", parentId: "web-app" },
    { id: "browser-storage", title: "Local Guest Canvas Storage", parentId: "web-app" },
    { id: "nginx", title: "nginx Proxy" },
    { id: "api", title: "Express API Server" },
    { id: "auth", title: "Auth & Access Control", parentId: "api" },
    { id: "realtime", title: "Socket.IO Collaboration", parentId: "api" },
    { id: "code-worker", title: "Code Execution Worker" },
    { id: "guest-cleanup", title: "Guest Cleanup Job" },
    { id: "postgres", title: "PostgreSQL" },
    { id: "redis", title: "Redis" },
    { id: "piston", title: "Piston Sandbox" },
    { id: "ci", title: "GitHub Actions CI/CD" },
  ],
  edges: [
    { from: "web-app", to: "nginx", label: "HTTP / WebSocket" },
    { from: "api-client", to: "api", label: "REST /api" },
    { from: "web-app", to: "realtime", label: "Socket.IO events" },
    { from: "nginx", to: "api", label: "proxies /api, /socket.io" },
    { from: "api", to: "postgres", label: "SQL via pg" },
    { from: "api", to: "redis", label: "cache get/set/del" },
    { from: "api", to: "code-worker", label: "enqueues run jobs (BullMQ)" },
    { from: "code-worker", to: "redis", label: "consumes queue" },
    { from: "code-worker", to: "piston", label: "HTTP execute" },
    { from: "code-worker", to: "realtime", label: "emits run:complete" },
    { from: "realtime", to: "postgres", label: "checks canvas access" },
    { from: "guest-cleanup", to: "postgres", label: "deletes idle guests" },
    { from: "auth", to: "postgres", label: "users queries" },
    { from: "ci", to: "api", label: "builds & pushes image" },
    { from: "ci", to: "nginx", label: "builds & pushes frontend image" },
  ],
};

const byId = (boxes: SectionBox[]) => new Map(boxes.map((b) => [b.id, b]));
const inside = (child: SectionBox, parent: SectionBox) =>
  child.x >= parent.x && child.y >= parent.y + GROUP_HEADER - 1 && child.x + child.w <= parent.x + parent.w && child.y + child.h <= parent.y + parent.h;
const overlap = (a: SectionBox, b: SectionBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Pairs that may overlap: a group and anything inside it.
function overlappingPairs(model: LayoutModel, boxes: SectionBox[]) {
  const parent = new Map(model.sections.map((s) => [s.id, s.parentId ?? null]));
  const isAncestor = (a: string, b: string) => {
    for (let p = parent.get(b); p; p = parent.get(p)) if (p === a) return true;
    return false;
  };
  const pairs: string[] = [];
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      if (!isAncestor(a.id, b.id) && !isAncestor(b.id, a.id) && overlap(a, b)) pairs.push(`${a.id}/${b.id}`);
    }
  }
  return pairs;
}

describe("box sizes", () => {
  test("fit the title, within limits, growing taller as it wraps", () => {
    expect(estimateBoxSize("API")).toEqual({ w: 140, h: 64 });
    const long = estimateBoxSize("A very long section title that has to wrap onto lines");
    expect(long.w).toBe(240);
    expect(long.h).toBeGreaterThan(64);
  });
});

describe("layout", () => {
  test("a chain reads left to right", async () => {
    const { boxes } = await layoutArchitecture({
      sections: [{ id: "db", title: "Postgres" }, { id: "web", title: "Web" }, { id: "api", title: "API" }],
      edges: [{ from: "web", to: "api", label: "REST" }, { from: "api", to: "db", label: "SQL" }],
    });
    const b = byId(boxes);
    expect(b.get("web")!.x).toBeLessThan(b.get("api")!.x);
    expect(b.get("api")!.x).toBeLessThan(b.get("db")!.x);
    // with room for the edge labels between them
    expect(b.get("api")!.x - (b.get("web")!.x + b.get("web")!.w)).toBeGreaterThanOrEqual(60);
  });

  test("a nested section sits inside its parent, below the title band", async () => {
    const model: LayoutModel = {
      sections: [{ id: "api", title: "Express API" }, { id: "auth", title: "Auth", parentId: "api" }, { id: "jobs", title: "Jobs", parentId: "api" }, { id: "db", title: "DB" }],
      edges: [{ from: "auth", to: "db", label: "users" }, { from: "api", to: "auth", label: "" }],
    };
    const layout = await layoutArchitecture(model);
    const b = byId(layout.boxes);

    expect(b.get("api")).toMatchObject({ isGroup: true, depth: 0 });
    expect(b.get("auth")).toMatchObject({ isGroup: false, depth: 1 });
    expect(inside(b.get("auth")!, b.get("api")!)).toBe(true);
    expect(inside(b.get("jobs")!, b.get("api")!)).toBe(true);
    expect(overlappingPairs(model, layout.boxes)).toEqual([]);
    // The parent comes before its children, so frames are drawn behind.
    const order = layout.boxes.map((x) => x.id);
    expect(order.indexOf("api")).toBeLessThan(order.indexOf("auth"));
    // An edge from a group to its own child would only cross the frame.
    expect(layout.edges).toEqual([{ from: "auth", to: "db", label: "users", bends: [] }]);
  });

  test("bad references don't lose sections or break the layout", async () => {
    const model: LayoutModel = {
      sections: [{ id: "a", title: "A", parentId: "missing" }, { id: "b", title: "B", parentId: "b" }],
      edges: [{ from: "a", to: "nowhere", label: "" }, { from: "a", to: "a", label: "" }, { from: "a", to: "b", label: "x" }],
    };
    const layout = await layoutArchitecture(model);
    expect(layout.boxes.map((x) => [x.id, x.depth])).toEqual([["a", 0], ["b", 0]]);
    expect(layout.edges).toEqual([{ from: "a", to: "b", label: "x", bends: [] }]);
  });

  test.each([
    ["Sonnet", FREE_FORM, 2],
    ["Opus", FREE_FORM_OPUS, 0],
  ] as const)("this repo's diagram by %s: every section placed, nothing overlapping, a sensible size", async (_name, model, dropped) => {
    const layout = await layoutArchitecture(model);
    const b = byId(layout.boxes);

    expect(layout.boxes).toHaveLength(model.sections.length);
    expect(overlappingPairs(model, layout.boxes)).toEqual([]);
    for (const s of model.sections) if (s.parentId) expect(inside(b.get(s.id)!, b.get(s.parentId)!)).toBe(true);
    for (const box of layout.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(layout.width);
      expect(box.y + box.h).toBeLessThanOrEqual(layout.height);
    }
    // Readable on a screen or two, not a mile-long strip.
    expect(layout.width).toBeLessThan(2500);
    expect(layout.height).toBeLessThan(1200);
    // Only edges from a group to its own child are left out.
    expect(layout.edges).toHaveLength(model.edges.length - dropped);
  });

  test.each([
    ["Sonnet", FREE_FORM],
    ["Opus", FREE_FORM_OPUS],
  ] as const)("this repo's diagram by %s: no arrow through a box, at most one crossing, few bends", async (_name, model) => {
    const quality = layoutQuality(model, await layoutArchitecture(model));
    expect(quality.edgesThroughBoxes).toBe(0);
    expect(quality.edgeCrossings).toBeLessThanOrEqual(1);
    // a couple routed around boxes, plus pairs of opposite arrows bowed apart
    expect(quality.bentEdges).toBeLessThanOrEqual(4);
  });

  test("an edge stays straight unless a box is in its way", async () => {
    // a → c skips a layer, so b sits between them.
    const model: LayoutModel = {
      sections: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }],
      edges: [{ from: "a", to: "b", label: "" }, { from: "b", to: "c", label: "" }, { from: "a", to: "c", label: "" }],
    };
    const layout = await layoutArchitecture(model);
    const edge = (from: string, to: string) => layout.edges.find((e) => e.from === from && e.to === to)!;
    expect(edge("a", "b").bends).toEqual([]);
    expect(edge("b", "c").bends).toEqual([]);
    expect(layoutQuality(model, layout).edgesThroughBoxes).toBe(0);
    // Whether a → c bends depends on where b lands; if it does, its bends
    // stay inside the diagram.
    for (const p of edge("a", "c").bends) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(layout.width);
    }
  });

  test("the same model always lays out the same way", async () => {
    const a = await layoutArchitecture(FREE_FORM);
    const b = await layoutArchitecture(FREE_FORM);
    expect(a).toEqual(b);
  });
});

describe("arrows both ways", () => {
  test("bow apart, to opposite sides, so their labels don't sit on each other", async () => {
    const model: LayoutModel = {
      sections: [{ id: "a", title: "A" }, { id: "b", title: "B" }],
      edges: [{ from: "a", to: "b", label: "asks" }, { from: "b", to: "a", label: "answers" }],
    };
    const layout = await layoutArchitecture(model);
    const [there, back] = layout.edges;
    expect(there.bends).toHaveLength(1);
    expect(back.bends).toHaveLength(1);
    // b is to the right of a, so the bows go up and down.
    expect(Math.abs(there.bends[0].y - back.bends[0].y)).toBeGreaterThanOrEqual(30);
    expect(layoutQuality(model, layout).edgeCrossings).toBe(0);
  });

  test("also between a group and something inside the other end's group", async () => {
    const model: LayoutModel = {
      sections: [{ id: "web", title: "Web" }, { id: "client", title: "Client", parentId: "web" }, { id: "proxy", title: "Proxy" }],
      edges: [{ from: "client", to: "proxy", label: "requests" }, { from: "proxy", to: "web", label: "serves" }],
    };
    const layout = await layoutArchitecture(model);
    expect(layout.edges.every((e) => e.bends.length === 1)).toBe(true);
  });

  test("a single arrow stays straight", async () => {
    const layout = await layoutArchitecture({ sections: [{ id: "a", title: "A" }, { id: "b", title: "B" }], edges: [{ from: "a", to: "b", label: "" }] });
    expect(layout.edges[0].bends).toEqual([]);
  });
});
