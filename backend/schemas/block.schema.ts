import {z} from "zod";

export const createSchema = z.object({
    type: z.enum(["text", "code"]),
    content: z.string().default(""),
    x: z.number().default(100),
    y: z.number().default(100),
    width: z.number().positive().default(300),
});

export const updateBlockSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
}).partial();

export const updateBlockContentSchema = z.object({
    content: z.string(),
});