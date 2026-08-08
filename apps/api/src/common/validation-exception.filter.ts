import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

type FieldMap = Record<string, string>;

function fieldsFromZodIssues(issues: unknown): FieldMap {
  if (!Array.isArray(issues)) return {};
  const fields: FieldMap = {};
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const path = Array.isArray((issue as { path?: unknown }).path)
      ? ((issue as { path: Array<string | number> }).path.join(".") || "_")
      : "_";
    const message =
      typeof (issue as { message?: unknown }).message === "string"
        ? (issue as { message: string }).message
        : "Ogiltigt värde";
    if (!fields[path]) fields[path] = message;
  }
  return fields;
}

/**
 * Normalize HTTP errors into a stable client-facing validation/error envelope.
 * Does not leak Zod stacks or internal exception names for normal 4xx.
 */
@Catch(HttpException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const requestId =
      req.requestId ??
      (typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"]
        : undefined);

    let code = status === HttpStatus.BAD_REQUEST ? "VALIDATION_ERROR" : "HTTP_ERROR";
    let message =
      status === HttpStatus.BAD_REQUEST
        ? "Kontrollera uppgifterna och försök igen."
        : exception.message;
    let fields: FieldMap = {};

    if (typeof body === "string") {
      message = body;
    } else if (body && typeof body === "object") {
      const obj = body as Record<string, unknown>;
      if (obj.issues) {
        fields = fieldsFromZodIssues(obj.issues);
        code = "VALIDATION_ERROR";
        message = "Kontrollera uppgifterna och försök igen.";
      } else if (typeof obj.message === "string") {
        message = obj.message;
      } else if (Array.isArray(obj.message)) {
        message = obj.message.join("; ");
      }
      if (obj.fields && typeof obj.fields === "object") {
        fields = { ...fields, ...(obj.fields as FieldMap) };
      }
      if (typeof obj.code === "string") code = obj.code;
    }

    if (status === HttpStatus.UNAUTHORIZED) code = "UNAUTHORIZED";
    if (status === HttpStatus.FORBIDDEN) code = "FORBIDDEN";
    if (status === HttpStatus.NOT_FOUND) code = "NOT_FOUND";
    if (status === HttpStatus.CONFLICT && code === "HTTP_ERROR") {
      code = "CONFLICT";
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) code = "RATE_LIMITED";

    res.status(status).json({
      error: {
        code,
        message,
        fields: Object.keys(fields).length ? fields : undefined,
        requestId: requestId ?? null,
      },
    });
  }
}
