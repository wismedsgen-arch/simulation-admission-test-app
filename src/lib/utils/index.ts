import { clsx } from "clsx";
import { formatDistanceToNowStrict, format } from "date-fns";

export function cn(...values: Array<string | false | null | undefined>) {
  return clsx(values);
}

export function formatDateTime(value?: Date | string | null) {
  if (!value) {
    return "Not set";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "PPP p");
}

export function formatRelativeTime(value?: Date | string | null) {
  if (!value) {
    return "just now";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function generateAccessCode() {
  return Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
}

export function normalizeInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeNameKey(value: string) {
  return normalizeInput(value).toLowerCase();
}

export function bytesToMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getMaxAttachmentBytes() {
  const raw = process.env.MAX_ATTACHMENT_BYTES ?? "26214400";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 26214400;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateInternalStaffIdentifier(fullName: string) {
  const base = slugify(fullName) || "staff";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `staff-${base}-${suffix}`;
}

export function isProtectedAdminName(fullName: string) {
  return normalizeNameKey(fullName) === "aviv";
}

export function detectTextDirection(value: string) {
  const text = normalizeInput(value);

  if (!text) {
    return "AUTO" as const;
  }

  return /[\u0590-\u05FF\u0600-\u06FF]/.test(text) ? ("RTL" as const) : ("LTR" as const);
}

export function toDomDir(direction?: string | null) {
  if (direction === "RTL") {
    return "rtl" as const;
  }

  if (direction === "LTR") {
    return "ltr" as const;
  }

  return "auto" as const;
}

export function toTextAlign(direction?: string | null) {
  if (direction === "RTL") {
    return "right" as const;
  }

  if (direction === "LTR") {
    return "left" as const;
  }

  return "start" as const;
}

export function suggestRoleEmailLabel(name: string) {
  const firstName = normalizeInput(name).split(" ")[0] ?? "";
  const localPart = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${localPart || "contact"}@gmail.com`;
}
