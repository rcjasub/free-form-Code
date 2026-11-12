import { z } from "zod";

// The contract between the AI and the canvas: what the AI must return when
// it reads a repo (Phase 2, step 3). It describes the architecture's meaning
// only: which sections there are, what each one is and which files belong
// to it, and how they connect. It never holds positions; a layout step
// works those out, so the AI can't produce an unreadable picture.
//
// parseArchitecture checks in two layers:
// - Zod checks each field (types, lengths, how many).
// - Then the cross-references: ids are unique, edges and parents point to
//   real sections, parents don't loop. These are rejected with plain
//   messages that can be sent back to the AI for a retry.
// Slips that don't change the picture are cleaned up with a warning
// instead of failing the whole diagram: a file path that isn't in the
// repo, an edge repeated or pointing to itself.

export const SECTION_KINDS = ["frontend", "backend", "db", "service", "external", "infra"] as const;

// Enough for a readable diagram, and well inside the 200 blocks one
// placement request can create (a box per section, an arrow per edge).
export const MAX_SECTIONS = 40;
export const MAX_EDGES = 80;
export const MAX_FILES_PER_SECTION = 50;
// How many levels sections can nest: 3 is a group in a group in a group.
export const MAX_DEPTH = 3;

// Short, readable ids ("api", "web-app", "postgres"), since they end up in
// shapes' meta and in later chats' context.
const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, "Use a short id of letters, digits, '-', '_' or '.'");

export const sectionSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(60),
  kind: z.enum(SECTION_KINDS),
  summary: z.string().trim().max(600),
  files: z.array(z.string().trim().min(1).max(300)).max(MAX_FILES_PER_SECTION).default([]),
  parentId: idSchema.nullish(),
});

export const edgeSchema = z.object({
  from: idSchema,
  to: idSchema,
  label: z.string().trim().max(60).default(""),
});

export const architectureModelSchema = z.object({
  // One or two sentences on what the whole project is.
  summary: z.string().trim().max(1000).default(""),
  sections: z.array(sectionSchema).min(1).max(MAX_SECTIONS),
  edges: z.array(edgeSchema).max(MAX_EDGES).default([]),
});

export type Section = z.infer<typeof sectionSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type ArchitectureModel = z.infer<typeof architectureModelSchema>;

export type ParseResult =
  | { ok: true; model: ArchitectureModel; warnings: string[] }
  | { ok: false; errors: string[] };

export interface ParseOptions {
  // The repo's file paths (the snapshot's tree). When given, each section's
  // files must be one of them, or a folder holding some of them.
  knownFiles?: Iterable<string>;
}

function zodErrors(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((issue) => {
    const where = issue.path.length ? issue.path.join(".") : "(top level)";
    return `${where}: ${issue.message}`;
  });
}

// Every folder that holds at least one known file, as "dir/".
function foldersOf(paths: Set<string>): Set<string> {
  const folders = new Set<string>();
  for (const path of paths) {
    let cut = path.lastIndexOf("/");
    while (cut > 0) {
      const folder = path.slice(0, cut + 1);
      if (folders.has(folder)) break;
      folders.add(folder);
      cut = path.lastIndexOf("/", cut - 1);
    }
  }
  return folders;
}

export function parseArchitecture(raw: unknown, options: ParseOptions = {}): ParseResult {
  const parsed = architectureModelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const model = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  const byId = new Map<string, Section>();
  for (const section of model.sections) {
    if (byId.has(section.id)) errors.push(`sections: the id "${section.id}" is used more than once`);
    byId.set(section.id, section);
  }

  for (const section of model.sections) {
    const parentId = section.parentId;
    if (parentId == null) continue;
    if (parentId === section.id) errors.push(`sections.${section.id}: it is its own parent`);
    else if (!byId.has(parentId)) errors.push(`sections.${section.id}: parentId "${parentId}" isn't a section`);
  }

  // Walk up from each section: a loop or a too-deep nest shows up as a
  // long walk. (Only once the parents themselves are known to exist.)
  if (errors.length === 0) {
    for (const section of model.sections) {
      let depth = 0;
      let current: Section | undefined = section;
      while (current?.parentId != null && depth <= MAX_SECTIONS) {
        current = byId.get(current.parentId);
        depth += 1;
      }
      if (depth > MAX_SECTIONS) {
        errors.push(`sections.${section.id}: its parents loop back to it`);
        break;
      }
      // depth counts the parents above it; levels counts it too.
      if (depth + 1 > MAX_DEPTH) {
        errors.push(`sections.${section.id}: nested ${depth + 1} levels deep; at most ${MAX_DEPTH}`);
      }
    }
  }

  for (const [i, edge] of model.edges.entries()) {
    for (const end of ["from", "to"] as const) {
      if (!byId.has(edge[end])) errors.push(`edges.${i}.${end}: "${edge[end]}" isn't a section`);
    }
  }

  if (errors.length) return { ok: false, errors };

  // Cleanups: these don't change what the diagram means.
  const seenEdges = new Map<string, Edge>();
  for (const edge of model.edges) {
    if (edge.from === edge.to) {
      warnings.push(`dropped an edge from "${edge.from}" to itself`);
      continue;
    }
    const key = `${edge.from}\u0000${edge.to}`;
    const earlier = seenEdges.get(key);
    if (earlier) {
      // Keep one arrow; its label lists both, if they differ.
      if (edge.label && !earlier.label.split(" / ").includes(edge.label)) {
        earlier.label = earlier.label ? `${earlier.label} / ${edge.label}`.slice(0, 60) : edge.label;
      }
      warnings.push(`merged a repeated edge from "${edge.from}" to "${edge.to}"`);
      continue;
    }
    seenEdges.set(key, { ...edge });
  }
  model.edges = [...seenEdges.values()];

  if (options.knownFiles) {
    const files = new Set(options.knownFiles);
    const folders = foldersOf(files);
    for (const section of model.sections) {
      const kept: string[] = [];
      for (const raw of section.files) {
        const path = raw.replace(/^\.?\//, "");
        const asFolder = path.endsWith("/") ? path : `${path}/`;
        if (files.has(path)) kept.push(path);
        else if (folders.has(asFolder)) kept.push(asFolder);
        else warnings.push(`sections.${section.id}: dropped "${raw}", which isn't in the repo`);
      }
      section.files = [...new Set(kept)];
    }
  }

  return { ok: true, model, warnings };
}

// The same contract as JSON Schema, for telling the AI what to return
// (step 4). The cross-reference checks above can't be written in JSON
// Schema, so the AI also gets them in words, and parseArchitecture still
// checks everything it returns.
export function architectureJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(architectureModelSchema, { io: "input" }) as Record<string, unknown>;
}

// The body of POST /api/canvases/:id/architecture. The API key and any
// GitHub token travel in headers, not here, so a body that ends up in a log
// or an error report never holds a secret. The model is one of the two the
// app offers (services/ai.ts: DEFAULT_MODEL and CAREFUL_MODEL).
export const AI_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5"] as const;

export const generateRequestSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  model: z.enum(AI_MODELS).optional(),
});
