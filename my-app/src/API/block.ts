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

export function createDrawingBlock(canvasId: string, x: number, y: number, width: number, content: string) {
  return api.post(`/canvases/${canvasId}/blocks`, {
    type: "draw",
    content,
    x,
    y,
    width,
  });
}

// Recreates a block from a saved copy — used for paste and for undoing a delete.
export function createBlockFrom(
  canvasId: string,
  block: { type: string; content: string; x: number; y: number; width: number },
) {
  return api.post(`/canvases/${canvasId}/blocks`, block);
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

export function updateBlockLink(canvasId: string, blockId: string, link: string | null) {
  return api.patch(`/canvases/${canvasId}/blocks/${blockId}/link`, { link });
}

export function updateBlockLanguage(canvasId: string, blockId: string, language: string) {
  return api.patch(`/canvases/${canvasId}/blocks/${blockId}/language`, { language });
}
