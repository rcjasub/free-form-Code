// The repo reader (Phase 2, step 1): turning a GitHub URL into a snapshot of
// the files and facts the AI draws from. GitHub and Redis are mocked, so
// these tests pin down which calls are made (the 60-an-hour limit makes that
// matter), what's chosen and the errors users see.

jest.mock("../redis", () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
}));

import { cacheGet, cacheSet } from "../redis";
import { parseRepoUrl, readRepo, RepoReadError } from "../services/github";
import { fitToBudget, isIgnored, pickFiles, scoreFile } from "../services/repoFiles";
import { findRoutes, parseCompose, parsePackage } from "../services/repoFacts";

const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const file = (path: string, content: string) => ({ path, content, truncated: false });

describe("parseRepoUrl", () => {
  test.each([
    ["https://github.com/owner/repo", { owner: "owner", repo: "repo", ref: null }],
    ["github.com/owner/repo", { owner: "owner", repo: "repo", ref: null }],
    ["https://www.github.com/Owner/my.repo-1/", { owner: "Owner", repo: "my.repo-1", ref: null }],
    ["https://github.com/owner/repo.git", { owner: "owner", repo: "repo", ref: null }],
    ["  https://github.com/owner/repo/tree/dev  ", { owner: "owner", repo: "repo", ref: "dev" }],
    ["https://github.com/owner/repo/blob/main/README.md", { owner: "owner", repo: "repo", ref: null }],
  ])("accepts %s", (input, expected) => {
    expect(parseRepoUrl(input)).toEqual(expected);
  });

  test.each([
    "",
    "owner/repo",
    "https://gitlab.com/owner/repo",
    "https://github.com.evil.com/owner/repo",
    "https://github.com:8080/owner/repo",
    "https://user:pw@github.com/owner/repo",
    "https://github.com/owner",
    "https://github.com/-bad/repo",
    "https://github.com/owner/..",
    "https://github.com/owner/re po",
    "https://github.com/owner/repo/tree/a..b",
    "https://github.com/owner/repo/tree/%0d%0a",
  ])("rejects %s", (input) => {
    expect(() => parseRepoUrl(input)).toThrow(expect.objectContaining({ code: "invalid_url" }));
  });

  test("dot segments resolve the way a browser would, so they never reach a request", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/tree/../../x")).toEqual({ owner: "owner", repo: "x", ref: null });
    expect(parseRepoUrl("https://github.com/owner/repo/tree/%2e%2e")).toEqual({ owner: "owner", repo: "repo", ref: null });
  });
});

describe("choosing files", () => {
  test("drops generated, vendored and binary files", () => {
    expect(isIgnored("node_modules/react/index.js")).toBe(true);
    expect(isIgnored("app/dist/main.js")).toBe(true);
    expect(isIgnored("package-lock.json")).toBe(true);
    expect(isIgnored("public/logo.png")).toBe(true);
    expect(isIgnored("static/app.min.js")).toBe(true);
    expect(isIgnored("src/server.ts")).toBe(false);
  });

  test("ranks the files that describe the architecture", () => {
    expect(scoreFile("README.md")).toBeGreaterThan(scoreFile("docker-compose.yml"));
    expect(scoreFile("docker-compose.yml")).toBeGreaterThan(scoreFile("backend/server.ts"));
    expect(scoreFile("backend/routes/auth.ts")).toBeGreaterThan(0);
    expect(scoreFile("my-app/src/main.tsx")).toBeGreaterThan(0);
    expect(scoreFile("server.ts")).toBeGreaterThan(scoreFile("packages/a/b/server.ts"));
    // Unremarkable source files, tests and docs are left to the tree listing.
    expect(scoreFile("src/utils/format.ts")).toBe(0);
    expect(scoreFile("backend/__tests__/routes/auth.test.ts")).toBe(0);
    expect(scoreFile("docs/api/routes.md")).toBe(0);
  });

  test("picks best first, within the file count, skipping huge files", () => {
    const tree = [
      { path: "src/utils/format.ts", size: 100 },
      { path: "backend/server.ts", size: 100 },
      { path: "README.md", size: 100 },
      { path: "package.json", size: 100 },
      { path: "data/schema.sql", size: 10_000_000 },
    ];
    expect(pickFiles(tree, { maxFiles: 2, maxTotalChars: 1000, maxFileChars: 100 })).toEqual(["README.md", "package.json"]);
    expect(pickFiles(tree)).toEqual(["README.md", "package.json", "backend/server.ts"]);
  });

  test("cuts files to the budget and stops when it's spent", () => {
    const budget = { maxFiles: 10, maxTotalChars: 1000, maxFileChars: 600 };
    const fitted = fitToBudget([file("a", "x".repeat(800)), file("b", "y".repeat(300)), file("c", "z".repeat(50))], budget);
    expect(fitted.map((f) => [f.path, f.content.length, f.truncated])).toEqual([
      ["a", 600, true],
      ["b", 300, false],
    ]);
  });
});

describe("facts", () => {
  test("package.json dependencies, including dev ones", () => {
    const pkg = parsePackage(file("api/package.json", JSON.stringify({ name: "api", dependencies: { pg: "1" }, devDependencies: { jest: "1" } })));
    expect(pkg).toEqual({ path: "api/package.json", name: "api", dependencies: ["jest", "pg"] });
    expect(parsePackage(file("package.json", '{"name": "cut off'))).toBeNull();
  });

  test("Python and Go manifests", () => {
    expect(parsePackage(file("requirements.txt", "flask==3.0\n# comment\nredis>=5 ; python_version>'3'\n-r other.txt\nsqlalchemy[asyncio]\n"))?.dependencies)
      .toEqual(["flask", "redis", "sqlalchemy"]);
    const pyproject = '[project]\nname = "app"\ndependencies = [\n    "fastapi[standard]>=0.1",\n    "psycopg[binary]>=3",\n    "pyjwt",\n]\n[dependency-groups]\ndev = ["pytest"]\n';
    expect(parsePackage(file("pyproject.toml", pyproject))).toEqual({ path: "pyproject.toml", name: "app", dependencies: ["fastapi", "psycopg", "pyjwt"] });
    const gomod = "module example.com/app\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgithub.com/lib/pq v1.10.9\n)\n";
    expect(parsePackage(file("go.mod", gomod))).toEqual({ path: "go.mod", name: "example.com/app", dependencies: ["github.com/gin-gonic/gin", "github.com/lib/pq"] });
  });

  test("Compose services, with list, map and inline forms", () => {
    const compose = [
      "version: '3'",
      "services:",
      "  # the API",
      "  api:",
      "    build: ./api",
      "    ports: [\"4000:4000\"]",
      "    depends_on:",
      "      db:",
      "        condition: service_healthy",
      "      cache:",
      "        condition: service_started",
      "    environment:",
      "      - A=1",
      "  db:",
      "    image: \"postgres:16\" # pinned",
      "    ports:",
      "      - \"5432:5432\"",
      "  cache:",
      "    image: redis",
      "    depends_on:",
      "      - db",
      "volumes:",
      "  data:",
    ].join("\n");
    expect(parseCompose(file("docker-compose.yml", compose))).toEqual([
      { file: "docker-compose.yml", name: "api", image: null, build: "./api", dependsOn: ["db", "cache"], ports: ["4000:4000"] },
      { file: "docker-compose.yml", name: "db", image: "postgres:16", build: null, dependsOn: [], ports: ["5432:5432"] },
      { file: "docker-compose.yml", name: "cache", image: "redis", build: null, dependsOn: ["db"], ports: [] },
    ]);
    expect(parseCompose(file("compose.yml", "name: x\n"))).toEqual([]);
  });

  test("HTTP routes from Express and Python frameworks", () => {
    const express = 'app.use("/api/auth", authRoutes);\nrouter.get("/me", authenticate, me);\nrouter.delete(`/:id`, remove);';
    expect(findRoutes(file("server.ts", express)).map((r) => `${r.method} ${r.path}`)).toEqual(["USE /api/auth", "GET /me", "DELETE /:id"]);
    const python = '@app.route("/")\ndef index(): ...\n@router.post("/items/{id}")\nasync def create(): ...';
    expect(findRoutes(file("main.py", python)).map((r) => `${r.method} ${r.path}`)).toEqual(["ANY /", "POST /items/{id}"]);
    expect(findRoutes(file("README.md", express))).toEqual([]);
  });
});

describe("readRepo", () => {
  const SHA = "a".repeat(40);
  // A token-shaped value made up per run, so no credential-like literal is
  // committed.
  const TOKEN = `ghp_${Array.from({ length: 36 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("")}`;
  let fetchMock: jest.SpyInstance;

  const reply = (body: string | object, status = 200, headers: Record<string, string> = {}) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

  // A small fake GitHub: the commit, the tree and three raw files.
  function fakeGitHub(overrides: Record<string, () => Response> = {}) {
    fetchMock.mockImplementation(async (input: string) => {
      const url = String(input);
      for (const [match, respond] of Object.entries(overrides)) if (url.includes(match)) return respond();
      // GitHub names are case-insensitive.
      if (url.toLowerCase().endsWith("/repos/owner/repo/commits/head")) return reply(SHA);
      if (url.endsWith(`/git/trees/${SHA}?recursive=1`)) {
        return reply({
          truncated: false,
          tree: [
            { path: "README.md", type: "blob", size: 20 },
            { path: "package.json", type: "blob", size: 40 },
            { path: "src", type: "tree" },
            { path: "src/server.ts", type: "blob", size: 30 },
            { path: "src/logo.bin.ts", type: "blob", size: 30 },
            { path: "node_modules/x/index.js", type: "blob", size: 10 },
          ],
        });
      }
      if (url.endsWith(`/${SHA}/README.md`)) return reply("# Repo");
      if (url.endsWith(`/${SHA}/package.json`)) return reply('{"name":"repo","dependencies":{"express":"4"}}');
      if (url.endsWith(`/${SHA}/src/server.ts`)) return reply('app.get("/health", h);');
      return reply("not found", 404);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    fetchMock = jest.spyOn(global, "fetch");
  });
  afterEach(() => fetchMock.mockRestore());

  test("reads the tree and chosen files into a snapshot, and caches it by commit", async () => {
    fakeGitHub();
    const snapshot = await readRepo("https://github.com/owner/repo");

    expect(snapshot.source).toEqual({ kind: "github", owner: "owner", repo: "repo", ref: null, commitSha: SHA, url: "https://github.com/owner/repo" });
    expect(snapshot.tree.map((t) => t.path)).toEqual(["README.md", "package.json", "src/server.ts", "src/logo.bin.ts"]);
    expect(snapshot.files.map((f) => f.path)).toEqual(["README.md", "package.json", "src/server.ts"]);
    expect(snapshot.facts.packages[0]).toMatchObject({ name: "repo", dependencies: ["express"] });
    expect(snapshot.facts.routes).toEqual([{ file: "src/server.ts", method: "GET", path: "/health" }]);

    // Only two calls go to the rate-limited API; files come from raw.
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.startsWith("https://api.github.com/"))).toHaveLength(2);
    expect(urls.filter((u) => u.startsWith("https://raw.githubusercontent.com/"))).toHaveLength(3);
    expect(mockCacheSet).toHaveBeenCalledWith(`repo:github:v1:owner/repo@${SHA}`, expect.any(String), 86400);
  });

  test("a cached snapshot costs one API call", async () => {
    fakeGitHub();
    const cached = await readRepo("https://github.com/owner/repo");
    fetchMock.mockClear();
    mockCacheGet.mockClear().mockResolvedValue(JSON.stringify(cached));

    // Differently cased, which GitHub treats as the same repo.
    const again = await readRepo("https://github.com/Owner/Repo");
    expect(again.files).toEqual(cached.files);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockCacheGet).toHaveBeenCalledWith(`repo:github:v1:owner/repo@${SHA}`);
  });

  test("a branch in the URL is resolved instead of the default branch", async () => {
    fakeGitHub({ "/commits/dev": () => reply(SHA) });
    const snapshot = await readRepo("https://github.com/owner/repo/tree/dev");
    expect(snapshot.source.ref).toBe("dev");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.github.com/repos/owner/repo/commits/dev");
  });

  test("skips files that look binary or can't be read", async () => {
    fakeGitHub({ "src/server.ts": () => reply("\u0000\u0001binary") });
    const snapshot = await readRepo("https://github.com/owner/repo");
    expect(snapshot.files.map((f) => f.path)).toEqual(["README.md", "package.json"]);
  });

  test("sends a token to GitHub but never into errors or the cache key", async () => {
    fakeGitHub({ "/commits/HEAD": () => reply({ message: "Bad credentials" }, 401) });
    const error = await readRepo("https://github.com/owner/repo", { token: TOKEN }).catch((e) => e);

    expect(error).toBeInstanceOf(RepoReadError);
    expect(error.code).toBe("bad_token");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(error) + error.message).not.toContain(TOKEN);
  });

  test("rejects a malformed token before calling GitHub", async () => {
    fakeGitHub();
    await expect(readRepo("https://github.com/owner/repo", { token: "abc\r\nX-Evil: 1" })).rejects.toMatchObject({ code: "invalid_token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("explains a missing repo, and suggests a token only without one", async () => {
    fakeGitHub({ "/commits/HEAD": () => reply({ message: "Not Found" }, 404) });
    await expect(readRepo("https://github.com/owner/repo")).rejects.toMatchObject({ code: "not_found", message: expect.stringContaining("add a GitHub token") });
    await expect(readRepo("https://github.com/owner/repo", { token: TOKEN })).rejects.toMatchObject({ code: "not_found", message: expect.stringContaining("can't see it") });
  });

  test("reports GitHub's rate limit with its reset time", async () => {
    fakeGitHub({
      "/commits/HEAD": () => reply({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1900000000" }),
    });
    const error = await readRepo("https://github.com/owner/repo").catch((e) => e);
    expect(error).toMatchObject({ code: "rate_limited", resetAt: new Date(1_900_000_000_000) });
  });

  test("an empty repo, a network failure, and an odd response are clean errors", async () => {
    fakeGitHub({ "/commits/HEAD": () => reply({ message: "Git Repository is empty." }, 409) });
    await expect(readRepo("https://github.com/owner/repo")).rejects.toMatchObject({ code: "empty_repo" });

    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(readRepo("https://github.com/owner/repo")).rejects.toMatchObject({ code: "upstream" });

    fakeGitHub({ "/commits/HEAD": () => reply("<html>") });
    await expect(readRepo("https://github.com/owner/repo")).rejects.toMatchObject({ code: "upstream" });
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});
