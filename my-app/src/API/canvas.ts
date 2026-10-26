import axios from "axios";

const api = axios.create({ baseURL: "/api", withCredentials: true });

export interface CanvasSummary {
  id: string;
  name: string;
  share_id: string;
  is_public: boolean;
}

// Newest first.
export function getMyCanvases() {
  return api.get<CanvasSummary[]>("/canvases");
}

export function createCanvas(name: string) {
  return api.post<CanvasSummary>("/canvases", { name });
}
