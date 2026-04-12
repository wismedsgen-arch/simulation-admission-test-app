import path from "path";

import { getMaxAttachmentBytes } from "@/lib/utils";

const allowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx"
]);

export function validateAttachment(file: File) {
  const extension = path.extname(file.name).toLowerCase();

  if (!allowedExtensions.has(extension)) {
    throw new Error("Only PDF, Word, PowerPoint, and Excel files are allowed.");
  }

  if (file.size > getMaxAttachmentBytes()) {
    throw new Error("This file exceeds the 25 MB attachment limit.");
  }
}
