import {
  BadRequestException,
  type PipeTransform,
} from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Parse untrusted input with Zod. Failures become VALIDATION_ERROR via
 * ValidationExceptionFilter (issues → fields).
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Kontrollera uppgifterna och försök igen.",
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
