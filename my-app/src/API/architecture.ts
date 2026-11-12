import axios from "axios";
import type { SectionKind } from "../lib/shapes";

const api = axios.create({ baseURL: "/api", withCredentials: true });

// What the AI describes a repo as: the same shape as the backend's contract
// (backend/schemas/architecture.schema.ts), already checked there.
export type { SectionKind };

export interface ArchitectureSection {
  id: string;
  title: string;
  kind: SectionKind;
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
// canvas's current architecture. The API key (and a GitHub token, for
// private repos) go in headers and are used for this one request.
export async function generateArchitecture(
  canvasId: string,
  request: { repoUrl: string; model?: AiModel; detail?: DetailLevel },
  secrets: { apiKey: string; githubToken?: string },
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const { data } = await api.post<GenerateResult>(`/canvases/${canvasId}/architecture`, request, {
    headers: {
      "X-Anthropic-Key": secrets.apiKey,
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
