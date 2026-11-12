// Hard facts pulled straight out of a repo's files: its packages and their
// dependencies, its Docker Compose services, its HTTP routes and its main
// languages. The AI gets these alongside the raw files so it groups, names
// and summarizes real things instead of guessing them from the text. Every
// extractor is best-effort: an unusual file yields fewer facts, never an
// error.

import type { RepoFile, TreeEntry } from "./repoFiles";

export interface PackageFact {
  path: string;
  name: string | null;
  dependencies: string[];
}

export interface ComposeServiceFact {
  file: string;
  name: string;
  image: string | null;
  build: string | null;
  dependsOn: string[];
  ports: string[];
}

export interface RouteFact {
  file: string;
  method: string;
  path: string;
}

export interface RepoFacts {
  languages: { language: string; files: number }[];
  packages: PackageFact[];
  composeServices: ComposeServiceFact[];
  routes: RouteFact[];
}

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
  mjs: "JavaScript", cjs: "JavaScript", py: "Python", go: "Go", rs: "Rust",
  java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP", cs: "C#", swift: "Swift",
  scala: "Scala", ex: "Elixir", exs: "Elixir", vue: "Vue", svelte: "Svelte",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", sql: "SQL",
};

export function countLanguages(tree: TreeEntry[]): RepoFacts["languages"] {
  const counts = new Map<string, number>();
  for (const { path } of tree) {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    const language = LANGUAGES[ext];
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts]
    .map(([language, files]) => ({ language, files }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 8);
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).toLowerCase();
}

export function parsePackage(file: RepoFile): PackageFact | null {
  const name = baseName(file.path);
  if (name === "package.json") {
    // A cut-off package.json isn't valid JSON; skip it rather than guess.
    try {
      const json = JSON.parse(file.content) as Record<string, unknown>;
      const deps = { ...(json.dependencies as object), ...(json.devDependencies as object) };
      return {
        path: file.path,
        name: typeof json.name === "string" ? json.name : null,
        dependencies: Object.keys(deps).sort(),
      };
    } catch {
      return null;
    }
  }
  if (name === "requirements.txt") {
    const dependencies = file.content
      .split("\n")
      .map((line) => line.replace(/#.*/, "").trim())
      .filter((line) => line && !line.startsWith("-"))
      .map((line) => line.split(/[<>=!~;\[ ]/)[0])
      .filter(Boolean);
    return { path: file.path, name: null, dependencies };
  }
  if (name === "go.mod") {
    const module = /^module\s+(\S+)/m.exec(file.content)?.[1] ?? null;
    const dependencies = [...file.content.matchAll(/^\s*(?:require\s+)?([\w.-]+\.[\w./-]+)\s+v[\d.]+/gm)]
      .map((m) => m[1])
      .filter((dep) => dep !== module);
    return { path: file.path, name: module, dependencies };
  }
  if (name === "pyproject.toml") {
    const projectName = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(file.content)?.[1] ?? null;
    // Entries can contain brackets ("fastapi[standard]"), so the list ends at
    // a "]" that closes a line, not the first one.
    const block = /^\s*dependencies\s*=\s*\[([\s\S]*?)\]\s*$/m.exec(file.content)?.[1] ?? "";
    const dependencies = [...block.matchAll(/["']([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
    return { path: file.path, name: projectName, dependencies };
  }
  return null;
}

// A small reader for the parts of a Compose file that matter here (service
// names, image, build, depends_on, ports). It follows indentation rather
// than parsing full YAML, which is enough for how Compose files are written
// and avoids a dependency for a best-effort fact.
export function parseCompose(file: RepoFile): ComposeServiceFact[] {
  const lines = file.content.split("\n");
  const services: ComposeServiceFact[] = [];
  const indentOf = (line: string) => line.length - line.trimStart().length;
  const clean = (value: string) => value.replace(/#.*$/, "").trim().replace(/^["']|["']$/g, "");

  const start = lines.findIndex((line) => /^services:\s*(#.*)?$/.test(line));
  if (start < 0) return services;

  let serviceIndent = -1;
  let current: ComposeServiceFact | null = null;
  let listKey: "dependsOn" | "ports" | null = null;
  let listIndent = -1;

  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = indentOf(line);
    if (indent === 0) break; // the next top-level key: services are over
    const text = line.trim();

    if (serviceIndent < 0) serviceIndent = indent;
    if (indent === serviceIndent) {
      const name = /^([\w.-]+):/.exec(text)?.[1];
      current = name ? { file: file.path, name, image: null, build: null, dependsOn: [], ports: [] } : null;
      if (current) services.push(current);
      listKey = null;
      continue;
    }
    if (!current) continue;

    if (listKey && indent > listIndent) {
      const item = /^-\s*(.+)$/.exec(text)?.[1];
      // depends_on can also be a map ("db:\n  condition: ...").
      const key = /^([\w.-]+):\s*$/.exec(text)?.[1];
      if (item) current[listKey].push(clean(item));
      else if (key && listKey === "dependsOn" && indent === listIndent + 2) current.dependsOn.push(key);
      continue;
    }
    listKey = null;

    const pair = /^([\w-]+):\s*(.*)$/.exec(text);
    if (!pair) continue;
    const [, key, rest] = pair;
    if (key === "image") current.image = clean(rest) || null;
    else if (key === "build") current.build = clean(rest) || ".";
    else if (key === "depends_on" || key === "ports") {
      const field = key === "depends_on" ? "dependsOn" : "ports";
      const inline = /^\[(.*)\]$/.exec(rest.trim())?.[1];
      if (inline) current[field].push(...inline.split(",").map(clean).filter(Boolean));
      else {
        listKey = field;
        listIndent = indent;
      }
    }
  }
  return services;
}

const ROUTE_PATTERNS: RegExp[] = [
  // Express, Koa routers, Fastify, Hono: app.get("/path", ...). Not after
  // "@", which is a Python decorator, matched below.
  /(?<!@)\b(?:app|router|server|api|fastify|\w+Router)\.(get|post|put|patch|delete|use|all)\(\s*["'`]([^"'`]+)["'`]/g,
  // Flask, FastAPI: @app.get("/path") / @app.route("/path")
  /@\w+\.(get|post|put|patch|delete|route)\(\s*["']([^"']+)["']/g,
];

export function findRoutes(file: RepoFile): RouteFact[] {
  if (!/\.(ts|js|mjs|cjs|py)$/i.test(file.path)) return [];
  const routes: RouteFact[] = [];
  for (const pattern of ROUTE_PATTERNS) {
    for (const match of file.content.matchAll(pattern)) {
      const method = match[1].toUpperCase();
      routes.push({ file: file.path, method: method === "ROUTE" ? "ANY" : method, path: match[2] });
    }
  }
  return routes;
}

export function extractFacts(tree: TreeEntry[], files: RepoFile[]): RepoFacts {
  const composeFiles = files.filter((f) => /^(docker-compose|compose)(\.[\w-]+)?\.ya?ml$/.test(baseName(f.path)));
  return {
    languages: countLanguages(tree),
    packages: files.map(parsePackage).filter((p): p is PackageFact => p !== null),
    composeServices: composeFiles.flatMap(parseCompose),
    routes: files.flatMap(findRoutes).slice(0, 200),
  };
}
