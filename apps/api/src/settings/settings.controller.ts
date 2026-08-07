import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";

@ApiTags("settings")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/settings")
export class SettingsController {
  @Get()
  get() {
    return {
      locale: "sv-SE",
      appearance: "system",
      financialPolicies: {
        minimumCashBalanceMinor: "6000000",
        emergencyFundTargetMinor: "12000000",
        safetyMarginMinor: "2000000",
        currency: "SEK",
      },
    };
  }
}
