
import {z} from "zod";

export const createSchema = z.object({
    type: z.enum(["text", "code"]),
    content: z.string().default(""),
    x: z.number().default(100),
    y: z.number().default(100),
    width: z.number().positive().default(300),
});

// width isn't included here: updateBlock only persists x/y (see
// blocksController.updateBlock + models/blocks.updateBlockPosition),
// and nothing in the app resizes a block after creation yet.
export const updateBlockSchema = z.object({
    x: z.number(),
    y: z.number(),
}).partial();

export const updateBlockContentSchema = z.object({
    content: z.string(),
});