import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  updateDocumentSchema,
  uploadDocumentSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { IntakeService } from "./intake.service";

@ApiTags("intake")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class IntakeController {
  constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}

  @Get("documents")
  documents(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.documents(user.userId, householdId);
  }

  @Get("documents/:id")
  getDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Param("id") id: string,
  ) {
    return this.intake.getDocument(user.userId, householdId, id);
  }

  @Post("documents/upload")
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(uploadDocumentSchema)) body: unknown,
  ) {
    return this.intake.uploadDocument(
      user.userId,
      uploadDocumentSchema.parse(body),
    );
  }

  @Patch("documents/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) body: unknown,
  ) {
    return this.intake.updateDocument(
      user.userId,
      id,
      updateDocumentSchema.parse(body),
    );
  }

  @Post("documents/:id/extract")
  extract(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Param("id") id: string,
  ) {
    return this.intake.reextract(user.userId, householdId, id);
  }

  @Get("integrations")
  integrations(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.integrations(user.userId, householdId);
  }

  @Get("imports")
  imports(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.imports(user.userId, householdId);
  }

  @Post("integrations/sync")
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.fakeSync(user.userId, householdId);
  }
}
