import { promises as fs } from "fs";
import path from "path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

/**
 * Write `body` to `storageKey` directly, without generating a new key.
 * Used by the H4 restore script to re-upload blobs under their original
 * keys after recreating the database rows that reference them.
 */
export async function saveFileAtKey(
  storageKey: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (!storageKey) {
    throw new Error("saveFileAtKey: storageKey is required");
  }

  if (storageMode() === "s3") {
    const client = createS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: storageKey,
        Body: body,
        ContentType: contentType
      })
    );
    return;
  }

  const root = process.env.STORAGE_LOCAL_DIR ?? "./.uploads";
  const outputPath = path.join(process.cwd(), root, storageKey);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, body);
}

/**
 * True iff something already lives at `storageKey`. Used by the restore
 * script's pre-flight to detect conflicts before overwriting.
 */
export async function fileExistsAtKey(storageKey: string): Promise<boolean> {
  if (!storageKey) return false;

  if (storageMode() === "s3") {
    const client = createS3Client();
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: storageKey
        })
      );
      return true;
    } catch (error) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  const root = process.env.STORAGE_LOCAL_DIR ?? "./.uploads";
  const filePath = path.join(process.cwd(), root, storageKey);
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return false;
    throw error;
  }
}

export async function deleteFile(storageKey: string): Promise<void> {
  if (!storageKey) return;

  if (storageMode() === "s3") {
    const client = createS3Client();
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: storageKey
        })
      );
    } catch (error) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
        return;
      }
      throw error;
    }
    return;
  }

  const root = process.env.STORAGE_LOCAL_DIR ?? "./.uploads";
  const filePath = path.join(process.cwd(), root, storageKey);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return;
    throw error;
  }
}
