import axios from "axios";
import type { SectionKind } from "../lib/shapes";
import type { Flow } from "../lib/flows";

const api = axios.create({ baseURL: "/api", withCredentials: true });

// What the AI describes a repo as: the same shape as the backend's contract
// (backend/schemas/architecture.schema.ts), already checked there.
export type { SectionKind };

// How a section's box is drawn, by its job: where things start (circle),
// what routes traffic on (diamond), or what does the work (rect). Missing
// on architectures read before shapes were asked for.
export type SectionShape = "rect" | "circle" | "diamond";

export interface ArchitectureSection {
  id: string;
  title: string;
  kind: SectionKind;
  shape?: SectionShape;
  summary: string;
  files: string[];
  parentId?: string | null;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label: string;
}

export interface ArchitectureModel {
  summary: string;
  sections: ArchitectureSection[];
  edges: ArchitectureEdge[];
  // key journeys through it, step by step (lib/flows); missing on
  // architectures read before flows were asked for
  flows?: Flow[];
}

export interface Architecture {
  id: string;
  canvas_id: string;
  repo_url: string;
  commit_sha: string;
  model: ArchitectureModel;
  created_at: string;
}

export interface GenerateResult {
  architecture: Architecture;
  // what the backend cleaned up in the AI's answer (made-up file paths, …)
  warnings: string[];
  // the model that wrote it
  servedBy: string;
}

// The two models offered: Sonnet by default, Opus for a more careful diagram.
export type AiModel = "claude-sonnet-5-5" | "claude-opus-5-5";

// How much of the system to show: about 5-9 boxes, or 15-40 with the
// main parts' pieces nested inside them.
export type DetailLevel = "overview" | "detailed";

// Reads the repo and has the AI describe it, saving the result as the
// canvas's current architecture. The server uses its own Anthropic key
// (backend/.env); a GitHub token, for private repos, goes in a header and is
// used for this one request.
export async function generateArchitecture(
  canvasId: string,
  request: { repoUrl: string; model?: AiModel; detail?: DetailLevel },
  secrets: { githubToken?: string } = {},
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const { data } = await api.post<GenerateResult>(`/canvases/${canvasId}/architecture`, request, {
    headers: {
      ...(secrets.githubToken && { "X-GitHub-Token": secrets.githubToken }),
    },
    signal,
  });
  return data;
}

// The canvas's current architecture, or null if it has none yet.
export async function getArchitecture(canvasId: string): Promise<Architecture | null> {
  try {
    const { data } = await api.get<{ architecture: Architecture }>(`/canvases/${canvasId}/architecture`);
    return data.architecture;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}
