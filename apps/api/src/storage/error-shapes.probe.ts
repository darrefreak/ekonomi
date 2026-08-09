/**
 * One-off diagnostic: what the S3 SDK actually returns for each failure.
 *
 * Run with:
 *   pnpm --filter @ffos/api exec tsx src/storage/error-shapes.probe.ts
 *
 * The FIR-001 fix turns on telling a missing object apart from a missing
 * bucket, and both arrive as HTTP 404. This prints the fields available to
 * distinguish them so the classifier is written against observed shapes rather
 * than assumptions.
 */

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const bucket = process.env.S3_BUCKET || "ffos";

function describe(label: string, err: unknown) {
  const error = err as {
    name?: string;
    message?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
    $fault?: string;
  };
  console.log(
    JSON.stringify(
      {
        label,
        name: error?.name,
        code: error?.Code,
        fault: error?.$fault,
        httpStatusCode: error?.$metadata?.httpStatusCode,
        message: error?.message,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "ffos",
      secretAccessKey: process.env.S3_SECRET_KEY || "ffossecret",
    },
  });

  const cases: Array<[string, () => Promise<unknown>]> = [
    [
      "HeadObject: bucket exists, key absent",
      () =>
        client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: "definitely/not/here.txt" }),
        ),
    ],
    [
      "HeadObject: bucket absent",
      () =>
        client.send(
          new HeadObjectCommand({
            Bucket: "bucket-som-inte-finns",
            Key: "definitely/not/here.txt",
          }),
        ),
    ],
    [
      "DeleteObject: bucket exists, key absent",
      () =>
        client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: "definitely/not/here.txt" }),
        ),
    ],
    [
      "DeleteObject: bucket absent",
      () =>
        client.send(
          new DeleteObjectCommand({
            Bucket: "bucket-som-inte-finns",
            Key: "definitely/not/here.txt",
          }),
        ),
    ],
  ];

  for (const [label, run] of cases) {
    try {
      const result = await run();
      console.log(
        JSON.stringify(
          {
            label,
            outcome: "no error",
            httpStatusCode: (result as { $metadata?: { httpStatusCode?: number } })
              ?.$metadata?.httpStatusCode,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      describe(label, err);
    }
  }

  // Wrong credentials against a bucket that does exist.
  const denied = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: "wrong", secretAccessKey: "wrong-secret-value" },
  });
  try {
    await denied.send(
      new HeadObjectCommand({ Bucket: bucket, Key: "definitely/not/here.txt" }),
    );
    console.log(JSON.stringify({ label: "HeadObject: bad credentials", outcome: "no error" }));
  } catch (err) {
    describe("HeadObject: bad credentials", err);
  }
  try {
    await denied.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: "definitely/not/here.txt" }),
    );
    console.log(
      JSON.stringify({ label: "DeleteObject: bad credentials", outcome: "no error" }),
    );
  } catch (err) {
    describe("DeleteObject: bad credentials", err);
  }

  // Nothing listening at all.
  const offline = new S3Client({
    region: "us-east-1",
    endpoint: "http://127.0.0.1:9;",
    forcePathStyle: true,
    credentials: { accessKeyId: "a", secretAccessKey: "b" },
  });
  try {
    await offline.send(new HeadObjectCommand({ Bucket: bucket, Key: "x" }));
  } catch (err) {
    describe("HeadObject: endpoint unreachable", err);
  }
}

void main();
