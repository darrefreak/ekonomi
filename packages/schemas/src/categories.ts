import { z } from "zod";
import { uuidSchema } from "./common";

export const categoryKindSchema = z.enum(["expense", "income", "transfer", "other"]);

export const categorySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  kind: z.string(),
  parentId: z.string().uuid().nullable().optional(),
  isSystem: z.boolean().optional(),
  archivedAt: z.string().nullable().optional(),
});

export const categoriesResponseSchema = z.object({
  items: z.array(categorySchema),
});

export const createCategorySchema = z
  .object({
    householdId: uuidSchema,
    name: z.string().min(1).max(120),
    kind: categoryKindSchema.optional().default("expense"),
    parentId: uuidSchema.optional().nullable(),
    key: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_]+$/, "key måste vara a-z0-9_")
      .optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    householdId: uuidSchema,
    name: z.string().min(1).max(120).optional(),
    kind: categoryKindSchema.optional(),
    parentId: uuidSchema.optional().nullable(),
  })
  .strict();

export const listCategoriesQuerySchema = z.object({
  householdId: uuidSchema,
  includeArchived: z.enum(["true", "false", "1", "0"]).optional(),
});

export type CategoryDto = z.infer<typeof categorySchema>;
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
