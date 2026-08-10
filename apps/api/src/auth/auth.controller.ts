import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "@ffos/schemas";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import type { AuthenticatedUser } from "./auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("register")
  register(@Body(new ZodValidationPipe(registerSchema)) body: unknown) {
    return this.auth.register(registerSchema.parse(body));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: unknown) {
    return this.auth.login(loginSchema.parse(body));
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: unknown) {
    const parsed = refreshSchema.parse(body);
    return this.auth.refresh(parsed.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post("logout")
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(logoutSchema)) body: unknown,
  ) {
    const parsed = logoutSchema.parse(body ?? {});
    return this.auth.logout(user.userId, parsed.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post("revoke-all")
  revokeAll(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.revokeAll(user.userId);
  }
}
