import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.trim() ? incoming : randomUUID();
  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
