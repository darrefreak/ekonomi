import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { AuthenticatedUser, JwtPayload } from "./auth.types";
import { requireAccessSecret } from "../common/jwt-secrets";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token");
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: requireAccessSecret(),
      });
      if (payload.typ !== "access") {
        throw new UnauthorizedException("Invalid token type");
      }
      req.user = { userId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
