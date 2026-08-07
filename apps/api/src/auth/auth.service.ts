import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import type { LoginInput, RegisterInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { refreshTokens, users } from "../db/schema";
import { logger } from "../common/logger";
import { requireAccessSecret } from "../common/jwt-secrets";
import { AuditService } from "../audit/audit.service";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseDurationMs(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input);
  if (!match) return 15 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const mult =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput) {
    const db = getDb();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const [user] = await db
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        passwordHash,
        displayName: input.displayName,
      })
      .returning();

    const tokens = await this.issueTokens(user.id, user.email);
    logger.info("user_registered", { userId: user.id });
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      tokens,
    };
  }

  async login(input: LoginInput) {
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const tokens = await this.issueTokens(user.id, user.email);
    logger.info("user_login", { userId: user.id });
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      tokens,
    };
  }

  async refresh(refreshToken: string) {
    const db = getDb();
    const tokenHash = hashToken(refreshToken);
    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return this.issueTokens(user.id, user.email);
  }

  async logout(userId: string, refreshToken?: string) {
    const db = getDb();
    const now = new Date();
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(refreshTokens.userId, userId),
            eq(refreshTokens.tokenHash, tokenHash),
            isNull(refreshTokens.revokedAt),
          ),
        );
    } else {
      await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(
          and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
        );
    }
    await this.audit.record({
      actorUserId: userId,
      action: "auth.logout",
      entity: "refresh_token",
      after: { scope: refreshToken ? "single" : "all_active" },
    });
    logger.info("user_logout", { userId });
    return { ok: true as const };
  }

  async revokeAll(userId: string) {
    const db = getDb();
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    await this.audit.record({
      actorUserId: userId,
      action: "auth.revoke_all",
      entity: "refresh_token",
      after: { scope: "all" },
    });
    logger.info("user_revoke_all", { userId });
    return { ok: true as const };
  }

  private async issueTokens(userId: string, email: string) {
    const accessTtl = process.env.JWT_ACCESS_TTL ?? "15m";
    const refreshTtl = process.env.JWT_REFRESH_TTL ?? "30d";
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, typ: "access" },
      {
        secret: requireAccessSecret(),
        expiresIn: accessTtl as `${number}${"s" | "m" | "h" | "d"}`,
      },
    );

    const refreshToken = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + parseDurationMs(refreshTtl));
    await getDb().insert(refreshTokens).values({
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    });

    return { accessToken, refreshToken };
  }
}
