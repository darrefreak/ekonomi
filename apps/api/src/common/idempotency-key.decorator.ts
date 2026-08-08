import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";

const MAX_KEY_LENGTH = 160;

/**
 * Client command identity from the HTTP `Idempotency-Key` header.
 *
 * This is deliberately separate from source-provider `externalId`: a manual
 * user command has no source id, but a retry of that command must still
 * collapse to one economic effect (V1_RT_BH_REPRO.md, RT-002).
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const raw = request?.headers?.["idempotency-key"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed) return undefined;
    if (trimmed.length > MAX_KEY_LENGTH) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Kontrollera uppgifterna och försök igen.",
        fields: {
          "Idempotency-Key": `Nyckeln får vara högst ${MAX_KEY_LENGTH} tecken.`,
        },
      });
    }
    return trimmed;
  },
);
