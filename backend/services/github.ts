// Reads a GitHub repo into a plain snapshot ({ tree, files, facts }) for the
// AI to draw from. Other sources (a zip, a local folder) could produce the
// same snapshot later; nothing downstream knows it came from GitHub.
//
// GitHub allows 60 unauthenticated API calls an hour per IP, so this spends
// as few as it can:
//   1. resolve the branch to a commit sha   (1 API call, every read)
//   2. on a cache miss, list the whole tree (1 API call)
//   3. read the chosen files from raw.githubusercontent.com, which doesn't
//      count against the API limit.
// A snapshot is cached in Redis by commit sha. A commit never changes, so a
// re-read of an unchanged repo costs one call.

import { cacheGet, cacheSet } from "../redis";
import { DEFAULT_BUDGET, fitToBudget, isIgnored, pickFiles, type FileBudget, type RepoFile, type TreeEntry } from "./repoFiles";
import { extractFacts, type RepoFacts } from "./repoFacts";

export interface RepoSnapshot {
  source: {
    kind: "github";
    owner: string;
    repo: string;
    // The branch, tag or sha asked for; null means the default branch.
    ref: string | null;
    commitSha: string;
    url: string;
  };
  // Every file path worth knowing about (generated and vendored folders
  // removed), up to MAX_TREE_ENTRIES.
  tree: TreeEntry[];
  treeTruncated: boolean;
  // The files chosen for the AI to read, best first, cut to the budget.
  files: RepoFile[];
  facts: RepoFacts;
}

export type RepoReadErrorCode =
  | "invalid_url"
  | "invalid_token"
  | "not_found"
  | "bad_token"
  | "rate_limited"
  | "empty_repo"
  | "upstream";

// An error that's safe to show the user: the message never includes the
// token or GitHub's raw response.
export class RepoReadError extends Error {
  constructor(
    public code: RepoReadErrorCode,
    message: string,
    // For rate_limited: when GitHub's limit resets.
    public resetAt?: Date,
  ) {
    super(message);
    this.name = "RepoReadError";
  }
}

export interface RepoRef {
  owner: string;
  repo: string;
  ref: string | null;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._\/-]{1,200}$/;

// Accepts https://github.com/owner/repo, with or without the scheme, "www.",
// a trailing ".git" or slash, and /tree/<ref> (a single-segment ref, since a
// branch name with slashes can't be told apart from a folder path).
// Everything is validated, since owner and repo end up in request URLs.
export function parseRepoUrl(input: string): RepoRef {
  const invalid = () =>
    new RepoReadError("invalid_url", "Enter a GitHub repository URL, like https://github.com/owner/repo.");
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500) throw invalid();

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw invalid();
  }
  if (!/^(www\.)?github\.com$/i.test(url.hostname) || url.port || url.username || url.password) throw invalid();

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw invalid();
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") throw invalid();

  let ref: string | null = null;
  if (parts[2] === "tree" || parts[2] === "commit") {
    const candidate = parts[3] ? decodeURIComponent(parts[3]) : "";
    if (!REF.test(candidate) || candidate.includes("..")) throw invalid();
    ref = candidate;
  }
  return { owner, repo, ref };
}

// Classic (ghp_...) and fine-grained (github_pat_...) tokens are both
// letters, digits and underscores. Checking the shape keeps anything odd
// out of the Authorization header.
const TOKEN = /^[A-Za-z0-9_]{20,255}$/;

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const TIMEOUT_MS = 15_000;
const FILE_CONCURRENCY = 8;
const MAX_TREE_ENTRIES = 5_000;
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function headers(token: string | undefined, accept: string): Record<string, string> {
  return {
    Accept: accept,
    "User-Agent": "free-form-repo-reader",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(url: string, token: string | undefined, accept: string): Promise<Response> {
  try {
    return await fetch(url, { headers: headers(token, accept), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new RepoReadError("upstream", "Couldn't reach GitHub. Check your connection and try again.");
  }
}

// Turns a failed GitHub API response into an error the user can act on.
function apiError(res: Response, hasToken: boolean): RepoReadError {
  if (res.status === 401) {
    return new RepoReadError("bad_token", "GitHub rejected the token. Check it hasn't expired or been revoked.");
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : undefined;
    return new RepoReadError(
      "rate_limited",
      hasToken
        ? "GitHub's rate limit for this token is used up. Try again later."
        : "GitHub's limit of 60 requests an hour without a token is used up. Add a GitHub token, or try again later.",
      resetAt,
    );
  }
  if (res.status === 404 || res.status === 422) {
    return new RepoReadError(
      "not_found",
      hasToken
        ? "Repository or branch not found, or the token can't see it."
        : "Repository or branch not found. If it's private, add a GitHub token.",
    );
  }
  if (res.status === 409) {
    return new RepoReadError("empty_repo", "That repository is empty.");
  }
  return new RepoReadError("upstream", `GitHub returned an error (${res.status}). Try again in a moment.`);
}

async function resolveCommit(ref: RepoRef, token: string | undefined): Promise<string> {
  const target = ref.ref ? encodeURIComponent(ref.ref) : "HEAD";
  const res = await request(
    `${API}/repos/${ref.owner}/${ref.repo}/commits/${target}`,
    token,
    // Asks for just the sha as plain text instead of the whole commit.
    "application/vnd.github.sha",
  );
  if (!res.ok) throw apiError(res, Boolean(token));
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new RepoReadError("upstream", "GitHub returned an unexpected response.");
  return sha;
}

interface GitTreeResponse {
  tree: { path: string; type: string; size?: number }[];
  truncated: boolean;
}

async function readTree(ref: RepoRef, sha: string, token: string | undefined): Promise<{ tree: TreeEntry[]; truncated: boolean }> {
  const res = await request(`${API}/repos/${ref.owner}/${ref.repo}/git/trees/${sha}?recursive=1`, token, "application/vnd.github+json");
  if (!res.ok) throw apiError(res, Boolean(token));
  const body = (await res.json()) as GitTreeResponse;
  const files = (Array.isArray(body.tree) ? body.tree : [])
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string" && !isIgnored(entry.path))
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));
  return {
    tree: files.slice(0, MAX_TREE_ENTRIES),
    // GitHub cuts very large trees itself (about 100,000 entries).
    truncated: Boolean(body.truncated) || files.length > MAX_TREE_ENTRIES,
  };
}

// Reads one file's text, or null if it can't be read or looks binary. A
// single unreadable file shouldn't fail the whole snapshot.
async function readFile(ref: RepoRef, sha: string, path: string, token: string | undefined): Promise<string | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  try {
    const res = await request(`${RAW}/${ref.owner}/${ref.repo}/${sha}/${encoded}`, token, "text/plain");
    if (!res.ok) return null;
    const text = await res.text();
    return text.includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

async function readFiles(ref: RepoRef, sha: string, paths: string[], token: string | undefined) {
  const contents: (string | null)[] = new Array(paths.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const i = next++;
      contents[i] = await readFile(ref, sha, paths[i], token);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FILE_CONCURRENCY, paths.length) }, worker));
  // Keep pickFiles' best-first order, so the budget goes to the best files.
  return paths
    .map((path, i) => ({ path, content: contents[i] }))
    .filter((file): file is { path: string; content: string } => file.content !== null);
}

// The cached snapshot includes the chosen files and the facts, so a change
// to how either is worked out (repoFiles.ts, repoFacts.ts, the budget) must
// bump this, or old snapshots keep being served for up to a day.
const SNAPSHOT_VERSION = 1;

function cacheKey(ref: RepoRef, sha: string): string {
  // GitHub names are case-insensitive, so Owner/Repo and owner/repo share.
  return `repo:github:v${SNAPSHOT_VERSION}:${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}@${sha}`;
}

export interface ReadRepoOptions {
  // A GitHub token: raises the limit to 5,000 calls an hour and allows
  // private repos. Used for this read only; never stored or logged.
  token?: string;
  budget?: FileBudget;
}

export async function readRepo(repoUrl: string, options: ReadRepoOptions = {}): Promise<RepoSnapshot> {
  const ref = parseRepoUrl(repoUrl);
  const token = options.token?.trim() || undefined;
  if (token && !TOKEN.test(token)) {
    throw new RepoReadError("invalid_token", "That doesn't look like a GitHub token.");
  }
  const budget = options.budget ?? DEFAULT_BUDGET;

  // Resolving the commit goes to GitHub every time, even when the snapshot
  // is cached. That's also the access check: a private repo's cached
  // snapshot is only reachable by someone whose token can resolve it.
  const sha = await resolveCommit(ref, token);
  const key = cacheKey(ref, sha);
  const sameBudget = budget === DEFAULT_BUDGET;

  if (sameBudget) {
    const cached = await cacheGet(key);
    if (cached) {
      try {
        const snapshot = JSON.parse(cached) as RepoSnapshot;
        // The cached copy may have been read through a URL that asked for a
        // different ref; report the one asked for this time.
        return { ...snapshot, source: { ...snapshot.source, ref: ref.ref } };
      } catch {
        // A corrupt entry is just a miss.
      }
    }
  }

  const { tree, truncated } = await readTree(ref, sha, token);
  const files = fitToBudget(await readFiles(ref, sha, pickFiles(tree, budget), token), budget);
  const snapshot: RepoSnapshot = {
    source: {
      kind: "github",
      owner: ref.owner,
      repo: ref.repo,
      ref: ref.ref,
      commitSha: sha,
      url: `https://github.com/${ref.owner}/${ref.repo}`,
    },
    tree,
    treeTruncated: truncated,
    files,
    facts: extractFacts(tree, files),
  };

  if (sameBudget) await cacheSet(key, JSON.stringify(snapshot), CACHE_TTL_SECONDS);
  return snapshot;
}
