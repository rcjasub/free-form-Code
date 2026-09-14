import {z} from "zod";

export const createSchema = z.object({
    name: z.string().min(3).max(50),
    is_public: z.boolean().optional().default(false),
});

export const updateSchema = z.object({
    name: z.string().min(3).max(50),
    is_public: z.boolean(),
}).partial();