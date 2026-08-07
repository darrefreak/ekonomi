import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createScenarioSchema,
  householdIdQuerySchema,
  scenarioIdParamSchema,
  simulateScenarioSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DecisionsService } from "./decisions.service";

@ApiTags("decisions")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class DecisionsController {
  constructor(@Inject(DecisionsService) private readonly decisions: DecisionsService) {}

  @Get("forecast")
  forecast(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.decisions.forecast(user.userId, query.householdId);
  }

  @Get("forecast/backtest")
  backtest(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.decisions.backtest(user.userId, query.householdId);
  }

  @Get("opportunities")
  opportunities(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.decisions.opportunities(user.userId, query.householdId);
  }

  @Get("risk")
  risk(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.decisions.risk(user.userId, query.householdId);
  }

  @Get("scenarios")
  scenarios(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.decisions.scenarios(user.userId, query.householdId);
  }

  @Post("scenarios")
  createScenario(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createScenarioSchema)) body: unknown,
  ) {
    return this.decisions.createScenario(
      user.userId,
      createScenarioSchema.parse(body),
    );
  }

  @Post("scenarios/:scenarioId/simulate")
  simulateScenario(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(scenarioIdParamSchema))
    params: { scenarioId: string },
    @Body(new ZodValidationPipe(simulateScenarioSchema)) body: unknown,
  ) {
    return this.decisions.simulateScenario(
      user.userId,
      params.scenarioId,
      simulateScenarioSchema.parse(body),
    );
  }

  @Get("insights")
  insights(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.decisions.insights(user.userId, query.householdId);
  }
}
