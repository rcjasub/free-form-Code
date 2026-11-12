import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be at most 50 characters"),
  email: z.email(),
  password: z.string().min(8),
});

// Deleting an account takes its password again, so a session cookie alone
// (a shared computer, a stolen cookie, a cross-site request) can't do it.
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required").max(72),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});
