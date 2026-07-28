import { z } from "zod";

// Validates payloads relayed between clients over sockets. Unlike the REST
// schemas in block.schema.ts, these don't apply defaults — they're checking
// an already-formed object before it's trusted and rebroadcast to every
// other client in the room, not shaping a create/update request.
export const blockCreatedEventSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  content: z.string(),
}).passthrough();

export const blockMovedEventSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
}).passthrough();

export const blockUpdatedEventSchema = z.object({
  id: z.string(),
  content: z.string(),
}).passthrough();

export const blockDeletedEventSchema = z.string();

export const cursorMoveEventSchema = z.object({
  x: z.number(),
  y: z.number(),
});
