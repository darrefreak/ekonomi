import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { loginSchema, refreshSchema, registerSchema } from "@ffos/schemas";
import { AuthService } from "./auth.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  register(@Body(new ZodValidationPipe(registerSchema)) body: unknown) {
    return this.auth.register(registerSchema.parse(body));
  }

  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: unknown) {
    return this.auth.login(loginSchema.parse(body));
  }

  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: unknown) {
    const parsed = refreshSchema.parse(body);
    return this.auth.refresh(parsed.refreshToken);
  }
}
