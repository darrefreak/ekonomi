import { Global, Module } from "@nestjs/common";
import { ObjectStorageService } from "./object-storage.service";

/**
 * One object-storage service for the whole application.
 *
 * `IntakeModule` and `PrivacyModule` each declared `ObjectStorageService` in
 * their own `providers`, which is how Nest was asked for two instances with
 * two independent views of whether the object store is reachable. Uploads went
 * to MinIO through one; the erasure path asked the other, got a different
 * answer, and deleted nothing (FPR-003).
 *
 * Global because storage is infrastructure rather than a feature: every module
 * that stores a document should be talking to the same configured backend.
 */
@Global()
@Module({
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class StorageModule {}
