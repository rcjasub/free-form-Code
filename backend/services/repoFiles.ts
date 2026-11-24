// Which files of a repo to show the AI. A repo can have tens of thousands of
// files, but a handful (manifests, the README, entry points, routes, the
// schema, Docker files) say most of what an architecture diagram needs. This
// module is pure (paths in, paths out) so the choice is easy to test and
// doesn't depend on where the files come from.

export interface TreeEntry {
  path: string;
  size: number;
}

// Folders that are generated, vendored or tooling noise. Anything under them
// is dropped from the tree entirely, so it never costs budget or attention.
const IGNORED_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", "coverage",
  ".git", ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache", ".venv",
  "venv", "env", "__pycache__", ".pytest_cache", ".mypy_cache", ".gradle",
  ".idea", ".vscode", "bower_components", "Pods", "DerivedData",
  "playwright-report", "test-results", "storybook-static",
]);

// Files that are never worth reading: lockfiles, binaries, media, minified.
const IGNORED_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|\.(png|jpe?g|gif|webp|ico|svg|bmp|tiff?|mp[34]|mov|webm|wav|ogg|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|tar|rar|7z|jar|war|class|exe|dll|so|dylib|bin|wasm|map|min\.js|min\.css|lock|snap|pyc|db|sqlite3?)$/i;

export function isIgnored(path: string): boolean {
  if (IGNORED_FILE.test(path)) return true;
  return path.split("/").some((part) => IGNORED_DIRS.has(part));
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|swift|scala|ex|exs|vue|svelte)$/i;

// A score for how much a file tells about the architecture; 0 means skip it.
// Shallow paths win ties, since `server.ts` at a package root says more than
// `server.ts` deep in a test fixture.
export function scoreFile(path: string): number {
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  const depth = path.split("/").length - 1;
  const parts = lower.split("/");
  let score = 0;

  if (/(^|\/)(__tests__|tests?|spec|e2e|fixtures?|mocks?|__mocks__|examples?|docs?)\//.test(lower)) {
    // Tests and docs rarely change the architecture; only their manifests count.
    if (name !== "package.json") return 0;
  }

  if (depth === 0 && /^readme(\.(md|markdown|rst|txt))?$/.test(name)) score = 100;
  else if (/^(docker-compose|compose)(\.[\w-]+)?\.ya?ml$/.test(name)) score = 95;
  else if (["package.json", "pyproject.toml", "requirements.txt", "go.mod", "cargo.toml",
    "pom.xml", "build.gradle", "build.gradle.kts", "gemfile", "composer.json", "mix.exs"].includes(name)) score = 90;
  else if (name === "dockerfile" || name.endsWith(".dockerfile")) score = 70;
  else if (/^schema\.(sql|prisma|graphql|gql)$/.test(name) || name.endsWith(".prisma")) score = 85;
  else if (/^(server|app|main|index)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/.test(name) || name === "manage.py" || name === "wsgi.py" || name === "asgi.py") score = 80;
  else if (SOURCE_EXT.test(name) && parts.some((p) => /^(routes?|router|api|controllers?|handlers?|endpoints?)$/.test(p))) score = 60;
  else if (SOURCE_EXT.test(name) && parts.some((p) => /^(models?|schemas?|entities|db|database)$/.test(p))) score = 50;
  else if (/^(socket|queue|worker|redis|cache|db|database|auth)\.(ts|js|py|go)$/.test(name)) score = 55;
  else if (/^(vite|next|nuxt|webpack|svelte|astro|remix)\.config\.(ts|js|mjs|cjs)$/.test(name)) score = 40;
  else if (/^\.github\/workflows\/.+\.ya?ml$/.test(lower)) score = 35;
  else if (depth === 0 && /^(makefile|procfile|fly\.toml|vercel\.json|netlify\.toml|render\.yaml)$/.test(name)) score = 40;
  else if (/^readme(\.(md|markdown|rst|txt))?$/.test(name)) score = 45;
  else return 0;

  return score - Math.min(depth, 6) * 3;
}

export interface FileBudget {
  maxFiles: number;
  maxTotalChars: number;
  maxFileChars: number;
}

export const DEFAULT_BUDGET: FileBudget = {
  maxFiles: 60,
  maxTotalChars: 150_000,
  maxFileChars: 12_000,
};

// The paths worth reading, best first, within the file count. Files bigger
// than a few times the per-file budget are still picked (they're cut down
// when read) unless they're huge, which usually means generated.
export function pickFiles(tree: TreeEntry[], budget: FileBudget = DEFAULT_BUDGET): string[] {
  return tree
    .filter((entry) => entry.size <= budget.maxFileChars * 40)
    .map((entry) => ({ path: entry.path, score: scoreFile(entry.path) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, budget.maxFiles)
    .map((entry) => entry.path);
}

export interface RepoFile {
  path: string;
  content: string;
  // True when the file was cut to fit the budget.
  truncated: boolean;
}

// Fits read files into the character budget, in the order given (best
// first). A file that doesn't fit whole is cut; once the budget is spent the
// rest are left out.
export function fitToBudget(files: { path: string; content: string }[], budget: FileBudget = DEFAULT_BUDGET): RepoFile[] {
  const fitted: RepoFile[] = [];
  let remaining = budget.maxTotalChars;
  for (const file of files) {
    if (remaining <= 200) break;
    const limit = Math.min(budget.maxFileChars, remaining);
    const truncated = file.content.length > limit;
    const content = truncated ? file.content.slice(0, limit) : file.content;
    fitted.push({ path: file.path, content, truncated });
    remaining -= content.length;
  }
  return fitted;
}
