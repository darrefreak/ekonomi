import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
