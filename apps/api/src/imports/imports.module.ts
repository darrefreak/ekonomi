import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { StorageModule } from "../storage/storage.module";
import { ImportsController } from "./imports.controller";
import { StatementImportService } from "./statement-import.service";

/**
 * Bank-statement file imports.
 *
 * Separate from `IntakeModule`, which handles documents and mock connector
 * syncs. A statement import writes to the ledger, so it keeps its own surface.
 */
@Module({
  imports: [AuthModule, HouseholdsModule, StorageModule],
  controllers: [ImportsController],
  providers: [StatementImportService],
  exports: [StatementImportService],
})
export class ImportsModule {}
