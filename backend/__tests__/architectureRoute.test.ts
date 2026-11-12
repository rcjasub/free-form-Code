// The architecture route (Phase 2, step 5), over real HTTP: the real router,
// middleware and signed cookie, with GitHub, the AI and the database mocked.
// Covers who may generate, what's checked before money is spent, what's
// saved, and the status and message for each kind of failure.

import { randomBytes } from "crypto";
import type { AddressInfo } from "net";
import type { Server } from "http";

const JWT_SECRET = randomBytes(24).toString("hex");
process.env.JWT_SECRET = JWT_SECRET;

jest.mock("../models/canvas");
jest.mock("../models/architectures");
jest.mock("../models/users", () => ({ touchGuest: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../services/github", () => {
  const actual = jest.requireActual("../services/github");
  return { ...actual, readRepo: jest.fn() };
});
jest.mock("../services/ai", () => {
  const actual = jest.requireActual("../services/ai");
  return { ...actual, generateArchitecture: jest.fn() };
});

import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import architectureRoutes from "../routes/architecture";
import * as Canvas from "../models/canvas";
import * as Architectures from "../models/architectures";
import { readRepo, RepoReadError } from "../services/github";
import { AiError, generateArchitecture } from "../services/ai";

const mockCanvas = Canvas as jest.Mocked<typeof Canvas>;
const mockArchitectures = Architectures as jest.Mocked<typeof Architectures>;
const mockReadRepo = readRepo as jest.MockedFunction<typeof readRepo>;
const mockGenerate = generateArchitecture as jest.MockedFunction<typeof generateArchitecture>;

const API_KEY = `sk-ant-api03-${randomBytes(30).toString("base64url")}`;
const SHA = "c".repeat(40);
const model = { summary: "An app.", sections: [{ id: "api", title: "API", kind: "backend" as const, summary: "", files: [] }], edges: [] };

let server: Server;
let base: string;
// A new user id per test, so each test starts with a fresh rate limit.
let userId: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/canvases/:id/architecture", architectureRoutes);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  jest.clearAllMocks();
  userId = `user-${randomBytes(4).toString("hex")}`;
  mockCanvas.getById.mockResolvedValue({
    id: "canvas-1", user_id: userId, name: "Mine", share_id: "abc", is_public: false, created_at: new Date(), updated_at: new Date(),
  });
  mockReadRepo.mockResolvedValue({
    source: { kind: "github", owner: "o", repo: "r", ref: null, commitSha: SHA, url: "https://github.com/o/r" },
    tree: [], treeTruncated: false, files: [], facts: { languages: [], packages: [], composeServices: [], routes: [] },
  });
  mockGenerate.mockResolvedValue({
    model, warnings: ["dropped x"], attempts: 1, servedBy: "claude-sonnet-5-5",
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
  });
  mockArchitectures.create.mockImplementation(async (p) => ({ id: "arch-1", created_at: new Date(), ...p }));
});

function cookie(id = userId) {
  return `token=${jwt.sign({ id, username: "ada" }, JWT_SECRET)}`;
}

function post(body: unknown, headers: Record<string, string> = {}, canvas = "canvas-1") {
  return fetch(`${base}/api/canvases/${canvas}/architecture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie(), "X-Anthropic-Key": API_KEY, ...headers },
    body: JSON.stringify(body),
  });
}

const valid = { repoUrl: "https://github.com/o/r" };

describe("generating", () => {
  test("reads the repo, asks the AI and saves the result", async () => {
    const res = await post({ ...valid, model: "claude-opus-5-5" }, { "X-GitHub-Token": "ghp_" + "x".repeat(36) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(mockReadRepo).toHaveBeenCalledWith("https://github.com/o/r", { token: "ghp_" + "x".repeat(36) });
    expect(mockGenerate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ apiKey: API_KEY, model: "claude-opus-5-5" }));
    expect(mockArchitectures.create).toHaveBeenCalledWith({
      canvas_id: "canvas-1", created_by: userId, repo_url: "https://github.com/o/r", commit_sha: SHA, model,
    });
    expect(body).toMatchObject({ architecture: { id: "arch-1", model }, warnings: ["dropped x"], servedBy: "claude-sonnet-5-5" });
    // The key never comes back.
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  test("the model defaults (none sent) and only the two offered are accepted", async () => {
    await post(valid);
    expect(mockGenerate.mock.calls[0][1].model).toBeUndefined();

    const res = await post({ ...valid, model: "claude-fable-5-2" });
    expect(res.status).toBe(400);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});

describe("checks before anything is spent", () => {
  test("signed out", async () => {
    const res = await fetch(`${base}/api/canvases/canvas-1/architecture`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid) });
    expect(res.status).toBe(401);
    expect(mockReadRepo).not.toHaveBeenCalled();
  });

  test("someone else's private canvas", async () => {
    mockCanvas.getById.mockResolvedValue({ id: "canvas-1", user_id: "someone-else", name: "", share_id: "x", is_public: false, created_at: new Date(), updated_at: new Date() });
    expect((await post(valid)).status).toBe(403);
    expect(mockReadRepo).not.toHaveBeenCalled();
  });

  test("a canvas that doesn't exist", async () => {
    mockCanvas.getById.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
  });

  test("no repo URL, or no API key", async () => {
    expect((await post({})).status).toBe(400);
    const res = await post(valid, { "X-Anthropic-Key": "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "missing_key" });
    expect(mockReadRepo).not.toHaveBeenCalled();
  });

  test("5 diagrams per 10 minutes per account", async () => {
    for (let i = 0; i < 5; i++) expect((await post(valid)).status).toBe(201);
    const res = await post(valid);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "too_many" });
    expect(mockGenerate).toHaveBeenCalledTimes(5);
  });

  test("one generation at a time per canvas", async () => {
    const result = await mockGenerate.getMockImplementation()!(undefined as never, undefined as never);
    let finish!: (value: typeof result) => void;
    mockGenerate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

    const first = post(valid);
    await waitFor(() => mockGenerate.mock.calls.length === 1);
    const second = await post(valid);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "in_progress" });

    finish(result);
    expect((await first).status).toBe(201);
    // Free again once the first is done.
    expect((await post(valid)).status).toBe(201);
  });

  test("closing the request cancels the AI call and saves nothing", async () => {
    let signal: AbortSignal | undefined;
    mockGenerate.mockImplementationOnce((_snapshot, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) =>
        options.signal!.addEventListener("abort", () => reject(new AiError("cancelled", "Cancelled."))),
      );
    });

    const controller = new AbortController();
    // Its own canvas, so if cancelling breaks, the stuck generation can't
    // hold the lock other tests need.
    const request = fetch(`${base}/api/canvases/canvas-cancel/architecture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie(), "X-Anthropic-Key": API_KEY },
      body: JSON.stringify(valid),
      signal: controller.signal,
    }).catch(() => "closed");
    await waitFor(() => signal !== undefined);
    controller.abort();

    expect(await request).toBe("closed");
    await waitFor(() => signal!.aborted);
    expect(mockArchitectures.create).not.toHaveBeenCalled();
    // The canvas is free for the next try.
    expect((await post(valid, {}, "canvas-cancel")).status).toBe(201);
  });
});

async function waitFor(condition: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("failures the user can act on", () => {
  test.each([
    [new RepoReadError("invalid_url", "Enter a GitHub repository URL."), 400],
    [new RepoReadError("not_found", "Repository not found."), 422],
    [new RepoReadError("rate_limited", "GitHub's limit is used up.", new Date(1_900_000_000_000)), 429],
  ])("repo: %s", async (error, status) => {
    mockReadRepo.mockRejectedValue(error);
    const res = await post(valid);
    const body = await res.json();
    expect(res.status).toBe(status);
    expect(body).toMatchObject({ error: error.message, code: error.code });
    if (error.resetAt) expect(body.resetAt).toBe("2030-03-17T17:46:40.000Z");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test.each([
    [new AiError("bad_key", "Anthropic rejected the API key."), 422],
    [new AiError("too_large", "Too large."), 413],
    [new AiError("overloaded", "Busy."), 503],
    [new AiError("invalid_output", "Not valid.", ['edges.0.to: "db" isn\'t a section']), 502],
  ])("AI: %s", async (error, status) => {
    mockGenerate.mockRejectedValue(error);
    const res = await post(valid);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: error.message, code: error.code, details: error.details });
    expect(mockArchitectures.create).not.toHaveBeenCalled();
  });

  test("a rejected Anthropic key is never a 401, which the app reads as signed out", async () => {
    mockGenerate.mockRejectedValue(new AiError("bad_key", "Anthropic rejected the API key."));
    expect((await post(valid)).status).not.toBe(401);
  });

  test("anything unexpected is a plain 500 with no details", async () => {
    mockArchitectures.create.mockRejectedValue(new Error("duplicate key value violates constraint"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    spy.mockRestore();
  });
});

describe("reading the current architecture", () => {
  test("returns the latest, or 404 when there's none", async () => {
    mockArchitectures.getLatest.mockResolvedValueOnce({ id: "arch-2", canvas_id: "canvas-1", created_by: null, repo_url: "u", commit_sha: SHA, model, created_at: new Date() });
    let res = await fetch(`${base}/api/canvases/canvas-1/architecture`, { headers: { Cookie: cookie() } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ architecture: { id: "arch-2" } });

    mockArchitectures.getLatest.mockResolvedValueOnce(null);
    res = await fetch(`${base}/api/canvases/canvas-1/architecture`, { headers: { Cookie: cookie() } });
    expect(res.status).toBe(404);
  });

  test("not from someone else's private canvas", async () => {
    mockCanvas.getById.mockResolvedValue({ id: "canvas-1", user_id: "someone-else", name: "", share_id: "x", is_public: false, created_at: new Date(), updated_at: new Date() });
    const res = await fetch(`${base}/api/canvases/canvas-1/architecture`, { headers: { Cookie: cookie() } });
    expect(res.status).toBe(403);
    expect(mockArchitectures.getLatest).not.toHaveBeenCalled();
  });
});
