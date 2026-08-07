import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
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

  async readLocal(storageKey: string): Promise<Buffer | null> {
    try {
      return await readFile(path.join(this.localRoot, storageKey));
    } catch {
      return null;
    }
  }
}
