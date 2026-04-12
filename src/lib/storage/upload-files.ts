import { saveFile } from "@/lib/storage";
import { validateAttachment } from "@/lib/validation/attachments";

export async function persistFiles(files: File[], keyPrefix: string) {
  const stored: Array<{
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }> = [];

  for (const file of files) {
    if (!file || file.size === 0) {
      continue;
    }

    validateAttachment(file);
    const body = Buffer.from(await file.arrayBuffer());

    stored.push(
      await saveFile({
        body,
        contentType: file.type || "application/octet-stream",
        fileName: file.name,
        keyPrefix
      })
    );
  }

  return stored;
}
