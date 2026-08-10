import { z } from "zod";

export const registerSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(128),
    displayName: z.string().min(1).max(120),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).max(4096),
  })
  .strict();

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).max(4096).optional(),
  })
  .strict();

export const revokeAllSchema = z.object({}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
