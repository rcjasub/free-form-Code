// The architecture contract (Phase 2, step 3): what the AI must return. Bad
// output has to be caught here, before anything is saved or drawn, with
// messages clear enough to send back to the AI for a retry.

import { architectureJsonSchema, MAX_EDGES, MAX_SECTIONS, parseArchitecture } from "../schemas/architecture.schema";

const section = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id.toUpperCase(),
  kind: "backend",
  summary: `The ${id}.`,
  files: [] as string[],
  ...extra,
});

// A small, valid model of a typical web app.
const valid = () => ({
  summary: "A collaborative canvas.",
  sections: [
    section("web", { kind: "frontend", files: ["my-app/src/App.tsx"] }),
    section("api", { files: ["backend/server.ts", "backend/routes/"] }),
    section("auth", { parentId: "api", files: ["backend/routes/auth.ts"] }),
    section("postgres", { kind: "db" }),
    section("github", { kind: "external" }),
  ],
  edges: [
    { from: "web", to: "api", label: "REST + sockets" },
    { from: "api", to: "postgres", label: "SQL" },
    { from: "api", to: "github" },
  ],
});

const TREE = ["my-app/src/App.tsx", "backend/server.ts", "backend/routes/auth.ts", "backend/routes/blocks.ts"];

function errorsOf(raw: unknown, knownFiles?: string[]) {
  const result = parseArchitecture(raw, { knownFiles });
  if (result.ok) throw new Error(`expected errors, got a model`);
  return result.errors;
}

function modelOf(raw: unknown, knownFiles?: string[]) {
  const result = parseArchitecture(raw, { knownFiles });
  if (!result.ok) throw new Error(`expected a model, got: ${result.errors.join("; ")}`);
  return result;
}

describe("a valid model", () => {
  test("passes, with defaults filled and text trimmed", () => {
    const raw = valid();
    raw.sections[0].title = "  Web app  ";
    const { model, warnings } = modelOf(raw, TREE);

    expect(warnings).toEqual([]);
    expect(model.sections).toHaveLength(5);
    expect(model.sections[0].title).toBe("Web app");
    expect(model.edges[2].label).toBe("");
    expect(model.sections.find((s) => s.id === "auth")?.parentId).toBe("api");
  });

  test("only summary, sections and their known fields are kept", () => {
    const raw = { ...valid(), x: 10, sections: [section("api", { x: 400, color: "red" })], edges: [] };
    const { model } = modelOf(raw);
    expect(Object.keys(model)).toEqual(["summary", "sections", "edges"]);
    expect(Object.keys(model.sections[0]).sort()).toEqual(["files", "id", "kind", "summary", "title"]);
  });
});

describe("field errors", () => {
  test.each([
    ["not an object", "a diagram please", "(top level)"],
    ["no sections", { sections: [] }, "sections"],
    ["an unknown kind", { sections: [section("api", { kind: "microservice" })] }, "sections.0.kind"],
    ["an id with spaces", { sections: [section("my api")] }, "sections.0.id"],
    ["an empty title", { sections: [section("api", { title: "   " })] }, "sections.0.title"],
    ["a long summary", { sections: [section("api", { summary: "x".repeat(601) })] }, "sections.0.summary"],
    ["files that aren't strings", { sections: [section("api", { files: [3] })] }, "sections.0.files.0"],
    ["a long edge label", { ...valid(), edges: [{ from: "web", to: "api", label: "x".repeat(61) }] }, "edges.0.label"],
  ])("%s", (_name, raw, where) => {
    expect(errorsOf(raw).join("\n")).toContain(`${where}:`);
  });

  test("too many sections or edges", () => {
    const sections = Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => section(`s${i}`));
    expect(errorsOf({ sections }).join()).toContain("sections:");
    const edges = Array.from({ length: MAX_EDGES + 1 }, () => ({ from: "a", to: "b" }));
    expect(errorsOf({ sections: [section("a"), section("b")], edges }).join()).toContain("edges:");
  });
});

describe("cross-references", () => {
  test("a repeated id", () => {
    const raw = valid();
    raw.sections.push(section("api"));
    expect(errorsOf(raw)).toEqual(['sections: the id "api" is used more than once']);
  });

  test("an edge to a section that doesn't exist", () => {
    const raw = valid();
    raw.edges.push({ from: "api", to: "redis", label: "cache" });
    expect(errorsOf(raw)).toEqual(['edges.3.to: "redis" isn\'t a section']);
  });

  test("a missing or self parent", () => {
    expect(errorsOf({ sections: [section("a", { parentId: "nope" })] })).toEqual(['sections.a: parentId "nope" isn\'t a section']);
    expect(errorsOf({ sections: [section("a", { parentId: "a" })] })).toEqual(["sections.a: it is its own parent"]);
  });

  test("parents that loop", () => {
    const sections = [section("a", { parentId: "c" }), section("b", { parentId: "a" }), section("c", { parentId: "b" })];
    expect(errorsOf({ sections })).toEqual(["sections.a: its parents loop back to it"]);
  });

  test("nesting deeper than 3 levels", () => {
    const sections = [section("a"), section("b", { parentId: "a" }), section("c", { parentId: "b" })];
    expect(parseArchitecture({ sections }).ok).toBe(true);
    sections.push(section("d", { parentId: "c" }));
    expect(errorsOf({ sections })).toEqual(["sections.d: nested 4 levels deep; at most 3"]);
  });

  test("a null parent is the same as none", () => {
    expect(parseArchitecture({ sections: [section("a", { parentId: null })] }).ok).toBe(true);
  });
});

describe("cleanups, with a warning instead of a failure", () => {
  test("an edge to itself is dropped", () => {
    const raw = valid();
    raw.edges.push({ from: "api", to: "api", label: "retries" });
    const { model, warnings } = modelOf(raw);
    expect(model.edges).toHaveLength(3);
    expect(warnings).toEqual(['dropped an edge from "api" to itself']);
  });

  test("repeated edges become one arrow with both labels", () => {
    const raw = valid();
    raw.edges.push({ from: "web", to: "api", label: "auth" }, { from: "web", to: "api", label: "REST + sockets" });
    const { model, warnings } = modelOf(raw);
    expect(model.edges.filter((e) => e.from === "web" && e.to === "api")).toEqual([{ from: "web", to: "api", label: "REST + sockets / auth" }]);
    expect(warnings).toHaveLength(2);
  });

  test("files are checked against the repo: real files and folders stay, made-up ones go", () => {
    const raw = valid();
    raw.sections[1].files = ["./backend/server.ts", "backend/routes", "backend/routes/", "backend/routes/users.ts", "src/"];
    const { model, warnings } = modelOf(raw, TREE);
    expect(model.sections[1].files).toEqual(["backend/server.ts", "backend/routes/"]);
    expect(warnings).toEqual([
      'sections.api: dropped "backend/routes/users.ts", which isn\'t in the repo',
      'sections.api: dropped "src/", which isn\'t in the repo',
    ]);
  });

  test("without a repo tree, files are kept as given", () => {
    const raw = valid();
    raw.sections[0].files = ["anything/at/all.ts"];
    expect(modelOf(raw).model.sections[0].files).toEqual(["anything/at/all.ts"]);
  });
});

test("the JSON Schema for the AI describes the same contract", () => {
  const schema = architectureJsonSchema() as {
    type: string;
    required: string[];
    properties: { sections: { maxItems: number; items: { required: string[]; properties: { kind: { enum: string[] } } } } };
  };
  expect(schema.type).toBe("object");
  expect(schema.required).toEqual(["sections"]);
  expect(schema.properties.sections.maxItems).toBe(MAX_SECTIONS);
  expect(schema.properties.sections.items.required).toEqual(expect.arrayContaining(["id", "title", "kind", "summary"]));
  expect(schema.properties.sections.items.properties.kind.enum).toEqual(["frontend", "backend", "db", "service", "external", "infra"]);
});
