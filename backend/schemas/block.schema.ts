
import {z} from "zod";
import { LANGUAGES, Language } from "../sandbox";

// Largest block content we accept, in characters. Pasted images are stored as
// data URLs inside the block, which is what needs the room; the 3mb body limit
// on block routes (server.ts) and the CHECK in schema.sql match it.
export const MAX_CONTENT_LENGTH = 3_000_000;

export const contentSchema = z.string().max(MAX_CONTENT_LENGTH, "Block content is too large");

// What a block can be set to: every runnable language, plus "text" for plain
// notes. runSchema still only takes LANGUAGES, so a text block can't be run.
export const languageSchema = z.enum([...(Object.keys(LANGUAGES) as Language[]), "text"]);

// null removes the link. Only http(s): the link is rendered as an <a href>
// for everyone on the canvas, and a "javascript:" URL there would run
// whatever code its author put in it in every viewer's browser.
export const linkSchema = z
    .string()
    .max(2048)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Link must start with http:// or https://")
    .nullable();

export const createSchema = z.object({
    type: z.enum(["text", "code", "draw", "image"]),
    content: contentSchema.default(""),
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
    content: contentSchema,
});

export const updateBlockLanguageSchema = z.object({
    language: languageSchema,
});

export const updateBlockLinkSchema = z.object({
    link: linkSchema,
});

// A text block's size. null resets: no wrap (grows with its longest line),
// or the default font size. The bounds just keep a block usable on screen.
export const wrapWidthSchema = z.number().min(40).max(4000).nullable();
export const fontSizeSchema = z.number().min(6).max(200).nullable();

export const updateBlockSizeSchema = z
    .object({
        wrapWidth: wrapWidthSchema.optional(),
        fontSize: fontSizeSchema.optional(),
    })
    .refine((s) => s.wrapWidth !== undefined || s.fontSize !== undefined, "Nothing to update");
