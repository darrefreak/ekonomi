import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StoredObject = {
  storageKey: string;
  bucket: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  driver: "s3" | "local";
};

export type StorageBackend = "s3" | "local";

/**
 * What a deletion actually achieved, as opposed to what was attempted.
 *
 * `NOT_FOUND` is only ever reported when the backend that owns the object
 * answered and said it is not there. A backend that cannot be reached is
 * `FAILED`, never "already gone" — that conflation is what let an erasure
 * report success while the object survived (FPR-003).
 */
export type ObjectDeletionOutcome = "DELETED" | "NOT_FOUND" | "FAILED";

export type ObjectDeletionResult = {
  outcome: ObjectDeletionOutcome;
  backend: StorageBackend;
  bucket: string;
  storageKey: string;
  reason?: string;
};

@Injectable()
export class ObjectStorageService {
  private readonly log = new Logger(ObjectStorageService.name);
  private readonly bucket = process.env.S3_BUCKET || "ffos";
  private readonly region = process.env.S3_REGION || "us-east-1";
  private readonly endpoint = process.env.S3_ENDPOINT || "";
  private readonly accessKey = process.env.S3_ACCESS_KEY || "";
  private readonly secretKey = process.env.S3_SECRET_KEY || "";
  private readonly localRoot =
    process.env.FFOS_LOCAL_STORAGE_DIR || "/tmp/ffos-object-storage";
  private readonly preferLocal =
    process.env.FFOS_STORAGE_DRIVER === "local" || !this.endpoint;
  private s3: S3Client | null = null;
  private s3Ready: boolean | null = null;

  private client(): S3Client {
    if (!this.s3) {
      this.s3 = new S3Client({
        region: this.region,
        endpoint: this.endpoint || undefined,
        forcePathStyle: true,
        credentials:
          this.accessKey && this.secretKey
            ? {
                accessKeyId: this.accessKey,
                secretAccessKey: this.secretKey,
              }
            : undefined,
      });
    }
    return this.s3;
  }

  private async ensureS3(): Promise<boolean> {
    if (this.preferLocal) return false;
    if (this.s3Ready != null) return this.s3Ready;
    try {
      const client = this.client();
      try {
        await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
      this.s3Ready = true;
      return true;
    } catch (err) {
      this.log.warn(
        `S3 unavailable (${err instanceof Error ? err.message : "error"}); using local storage`,
      );
      this.s3Ready = false;
      return false;
    }
  }

  async putObject(input: {
    householdId: string;
    filename: string;
    contentType: string;
    body: Buffer;
  }): Promise<StoredObject> {
    const checksumSha256 = createHash("sha256").update(input.body).digest("hex");
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    const storageKey = `households/${input.householdId}/documents/${randomUUID()}-${safeName}`;
    const useS3 = await this.ensureS3();

    if (useS3) {
      await this.client().send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: { checksum: checksumSha256 },
        }),
      );
      return {
        storageKey,
        bucket: this.bucket,
        contentType: input.contentType,
        byteSize: input.body.byteLength,
        checksumSha256,
        driver: "s3",
      };
    }

    const full = path.join(this.localRoot, storageKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.body);
    return {
      storageKey,
      bucket: "local",
      contentType: input.contentType,
      byteSize: input.body.byteLength,
      checksumSha256,
      driver: "local",
    };
  }

  async getSignedGetUrl(storageKey: string, bucket?: string | null): Promise<string | null> {
    if (!storageKey) return null;
    const useS3 = await this.ensureS3();
    if (useS3 && (bucket ?? this.bucket) !== "local") {
      return getSignedUrl(
        this.client(),
        new GetObjectCommand({
          Bucket: bucket || this.bucket,
          Key: storageKey,
        }),
        { expiresIn: 60 * 15 },
      );
    }
    // Local driver: opaque path token for API download proxy.
    return `/api/v1/documents/local-file?key=${encodeURIComponent(storageKey)}`;
  }

  /**
   * Which backend owns an object, taken from what was recorded when it was
   * stored rather than from what this process happens to be able to reach.
   *
   * An object written to MinIO is not deleted by removing a file from a local
   * directory, however unavailable MinIO is right now.
   */
  private backendFor(bucket?: string | null): StorageBackend {
    if (bucket === "local") return "local";
    if (bucket) return "s3";
    return this.preferLocal ? "local" : "s3";
  }

  private static isMissingObject(err: unknown): boolean {
    const name = (err as { name?: string })?.name ?? "";
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    return name === "NotFound" || name === "NoSuchKey" || status === 404;
  }

  /**
   * Remove a stored object from the backend that owns it and report what
   * actually happened, confirmed by reading back.
   *
   * There is no fallback here on purpose. The local driver is a convenience for
   * a laptop with no MinIO; it is not a stand-in for an object store that is
   * merely unreachable, and treating it as one deletes nothing while reporting
   * success.
   */
  async deleteObject(
    storageKey: string,
    bucket?: string | null,
  ): Promise<ObjectDeletionResult> {
    const backend = this.backendFor(bucket);
    const resolvedBucket = backend === "local" ? "local" : bucket || this.bucket;
    const base = { backend, bucket: resolvedBucket, storageKey } as const;

    if (!storageKey) {
      return { ...base, outcome: "NOT_FOUND", reason: "no storage key recorded" };
    }

    if (backend === "s3") {
      if (!this.endpoint) {
        return {
          ...base,
          outcome: "FAILED",
          reason:
            "the object is held in object storage but no S3 endpoint is configured",
        };
      }
      try {
        await this.client().send(
          new DeleteObjectCommand({ Bucket: resolvedBucket, Key: storageKey }),
        );
      } catch (err) {
        if (!ObjectStorageService.isMissingObject(err)) {
          return {
            ...base,
            outcome: "FAILED",
            reason: err instanceof Error ? err.message : "delete failed",
          };
        }
      }
      // Read back: a delete that returned without error still has to be true.
      try {
        await this.client().send(
          new HeadObjectCommand({ Bucket: resolvedBucket, Key: storageKey }),
        );
        return {
          ...base,
          outcome: "FAILED",
          reason: "the object is still present after the delete",
        };
      } catch (err) {
        if (ObjectStorageService.isMissingObject(err)) {
          return { ...base, outcome: "DELETED" };
        }
        return {
          ...base,
          outcome: "FAILED",
          reason:
            err instanceof Error
              ? `could not confirm removal: ${err.message}`
              : "could not confirm removal",
        };
      }
    }

    const full = path.join(this.localRoot, storageKey);
    try {
      await stat(full);
    } catch (err) {
      if ((err as { code?: string })?.code === "ENOENT") {
        return { ...base, outcome: "NOT_FOUND" };
      }
      return {
        ...base,
        outcome: "FAILED",
        reason: err instanceof Error ? err.message : "could not read local object",
      };
    }
    try {
      await rm(full, { force: true });
      await stat(full);
      return {
        ...base,
        outcome: "FAILED",
        reason: "the object is still present after the delete",
      };
    } catch (err) {
      if ((err as { code?: string })?.code === "ENOENT") {
        return { ...base, outcome: "DELETED" };
      }
      return {
        ...base,
        outcome: "FAILED",
        reason: err instanceof Error ? err.message : "delete failed",
      };
    }
  }

  /**
   * Whether the object is still stored, asked of the backend that owns it.
   *
   * `null` means the question could not be answered — the owning backend did
   * not respond — which is not the same as "no" and must not be read as one.
   */
  async objectExists(
    storageKey: string,
    bucket?: string | null,
  ): Promise<boolean | null> {
    if (!storageKey) return false;
    if (this.backendFor(bucket) === "s3") {
      if (!this.endpoint) return null;
      try {
        await this.client().send(
          new HeadObjectCommand({
            Bucket: bucket || this.bucket,
            Key: storageKey,
          }),
        );
        return true;
      } catch (err) {
        return ObjectStorageService.isMissingObject(err) ? false : null;
      }
    }
    return (await this.readLocal(storageKey)) != null;
  }

  async readLocal(storageKey: string): Promise<Buffer | null> {
    try {
      return await readFile(path.join(this.localRoot, storageKey));
    } catch {
      return null;
    }
  }
}
