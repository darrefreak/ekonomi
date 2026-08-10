import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  commitStatementImportSchema,
  householdIdQuerySchema,
  idParamSchema,
  inspectStatementImportSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StatementImportService } from "./statement-import.service";

@ApiTags("imports")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/imports")
export class ImportsController {
  constructor(
    @Inject(StatementImportService) private readonly imports: StatementImportService,
  ) {}

  /**
   * Parse and preserve a statement, and return the preview.
   *
   * Deliberately writes no financial event: selecting a file must never commit
   * money.
   */
  @Post("statements/inspect")
  inspect(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(inspectStatementImportSchema)) body: unknown,
  ) {
    return this.imports.inspect(
      user.userId,
      inspectStatementImportSchema.parse(body),
    );
  }

  /** Confirm a previewed batch. This is the step that writes to the ledger. */
  @Post("statements/commit")
  commit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(commitStatementImportSchema)) body: unknown,
  ) {
    return this.imports.commit(user.userId, commitStatementImportSchema.parse(body));
  }

  @Get("history")
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.imports.history(user.userId, query.householdId);
  }

  @Get("batches/:id")
  batch(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    return this.imports.batch(user.userId, query.householdId, params.id);
  }
}
