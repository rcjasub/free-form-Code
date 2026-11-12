import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as Architectures from "../models/architectures";
import { readRepo, RepoReadError, type RepoReadErrorCode } from "../services/github";
import { AiError, generateArchitecture, type AiErrorCode } from "../services/ai";
import { handleServerError } from "../utils/errors";

// Repo and AI failures are the user's to fix (a typo in the URL, a wrong
// key, GitHub's limit), so they get their own codes and messages. None is a
// 401: that means "you're signed out" to the app, and a rejected Anthropic
// key or GitHub token isn't that.
const REPO_STATUS: Record<RepoReadErrorCode, number> = {
  invalid_url: 400,
  invalid_token: 400,
  not_found: 422,
  bad_token: 422,
  empty_repo: 422,
  rate_limited: 429,
  upstream: 502,
};

const AI_STATUS: Record<AiErrorCode, number> = {
  invalid_key: 400,
  bad_key: 422,
  too_large: 413,
  rate_limited: 429,
  refused: 422,
  truncated: 502,
  invalid_output: 502,
  overloaded: 503,
  upstream: 502,
  // The caller left, so nobody reads this; 499 is the usual "client closed".
  cancelled: 499,
};

// Canvases with a diagram being generated right now. One at a time per
// canvas: a double-click, or two collaborators asking at once, would
// otherwise each pay for a diagram and race to save it. Per server
// process, which is all there is today.
const generating = new Set<string>();

function header(req: AuthRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

// POST /api/canvases/:id/architecture  { repoUrl, model? }
// Headers: X-Anthropic-Key (required), X-GitHub-Token (optional).
// Reads the repo, asks the AI for its architecture and saves it as the
// canvas's current one. Body checked by generateRequestSchema; access by
// requireCanvasAccess.
export async function generate(req: AuthRequest, res: Response): Promise<void> {
  const canvasId = req.params.id;
  const { repoUrl, model } = req.body as { repoUrl: string; model?: string };
  const apiKey = header(req, "x-anthropic-key");
  if (!apiKey) {
    res.status(400).json({ error: "Add your Anthropic API key to generate a diagram.", code: "missing_key" });
    return;
  }

  if (generating.has(canvasId)) {
    res.status(409).json({ error: "A diagram is already being generated for this canvas.", code: "in_progress" });
    return;
  }
  generating.add(canvasId);

  // Stop the AI call if the person who asked goes away before it's done.
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  try {
    const snapshot = await readRepo(repoUrl, { token: header(req, "x-github-token") });
    const result = await generateArchitecture(snapshot, { apiKey, model, signal: abort.signal });
    const architecture = await Architectures.create({
      canvas_id: canvasId,
      created_by: req.user?.id ?? null,
      repo_url: snapshot.source.url,
      commit_sha: snapshot.source.commitSha,
      model: result.model,
    });
    res.status(201).json({
      architecture,
      warnings: result.warnings,
      servedBy: result.servedBy,
      usage: result.usage,
    });
  } catch (err) {
    if (err instanceof RepoReadError) {
      res.status(REPO_STATUS[err.code]).json({
        error: err.message,
        code: err.code,
        ...(err.resetAt && { resetAt: err.resetAt.toISOString() }),
      });
    } else if (err instanceof AiError) {
      if (err.code !== "cancelled") {
        res.status(AI_STATUS[err.code]).json({ error: err.message, code: err.code, details: err.details });
      }
    } else {
      handleServerError(res, err);
    }
  } finally {
    generating.delete(canvasId);
  }
}

// GET /api/canvases/:id/architecture: the canvas's current architecture,
// or 404 if its diagram was never generated.
export async function getLatest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const architecture = await Architectures.getLatest(req.params.id);
    if (!architecture) {
      res.status(404).json({ error: "This canvas has no generated diagram yet." });
      return;
    }
    res.json({ architecture });
  } catch (err) {
    handleServerError(res, err);
  }
}
