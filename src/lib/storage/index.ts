import { promises as fs } from "fs";
import path from "path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

type UploadInput = {
  body: Buffer;
  contentType: string;
  fileName: string;
  keyPrefix: string;
};

export type StoredFile = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

function storageMode() {
  return process.env.STORAGE_MODE === "s3" && process.env.STORAGE_BUCKET
    ? "s3"
    : "local";
}

function makeStorageKey(prefix: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${prefix}/${Date.now()}-${safeName}`;
}

function createS3Client() {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? ""
    }
  });
}

export async function saveFile(input: UploadInput): Promise<StoredFile> {
  const storageKey = makeStorageKey(input.keyPrefix, input.fileName);

  if (storageMode() === "s3") {
    const client = createS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: storageKey,
        Body: input.body,
        ContentType: input.contentType
      })
    );

    return {
      storageKey,
      fileName: input.fileName,
      mimeType: input.contentType,
      sizeBytes: input.body.byteLength
    };
  }

  const root = process.env.STORAGE_LOCAL_DIR ?? "./.uploads";
  const outputPath = path.join(process.cwd(), root, storageKey);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, input.body);

  return {
    storageKey,
    fileName: input.fileName,
    mimeType: input.contentType,
    sizeBytes: input.body.byteLength
  };
}

export async function getFileBuffer(storageKey: string) {
  if (storageMode() === "s3") {
    const client = createS3Client();
    const result = await client.send(
      new GetObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: storageKey
      })
    );

    const chunks: Buffer[] = [];
    const stream = result.Body as AsyncIterable<Uint8Array>;

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  const root = process.env.STORAGE_LOCAL_DIR ?? "./.uploads";
  return fs.readFile(path.join(process.cwd(), root, storageKey));
}
