
import {z} from "zod";
import { LANGUAGES, Language } from "../sandbox";

export const createSchema = z.object({
    type: z.enum(["text", "code", "draw", "image"]),
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

export const updateBlockLanguageSchema = z.object({
    language: z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]),
});
// null removes the link. Only http(s): the link is rendered as an <a href>
// for everyone on the canvas, and a "javascript:" URL there would run
// whatever code its author put in it in every viewer's browser.
export const updateBlockLinkSchema = z.object({
    link: z
        .string()
        .max(2048)
        .url()
        .refine((u) => /^https?:\/\//i.test(u), "Link must start with http:// or https://")
        .nullable(),
});
