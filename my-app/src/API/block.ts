import axios from "axios";

const api = axios.create({ baseURL: "/api", withCredentials: true });

export function getAllBlocks(canvasId: string) {
  return api.get(`/canvases/${canvasId}/blocks`);
}

export function createBlock(canvasId: string, x: number, y: number) {
  return api.post(`/canvases/${canvasId}/blocks`, {
    type: "code",
    content: "",
    x,
    y,
    width: 300,
  });
}

export function updateBlockPosition(canvasId: string, blockId: string, x: number, y: number) {
  return api.put(`/canvases/${canvasId}/blocks/${blockId}`, { x, y });
}

export function deleteBlock(canvasId: string, blockId: string) {
  return api.delete(`/canvases/${canvasId}/blocks/${blockId}`);
}

export function updateBlockContent(canvasId: string, blockId: string, content: string) {
  return api.patch(`/canvases/${canvasId}/blocks/${blockId}/content`, { content });
}
