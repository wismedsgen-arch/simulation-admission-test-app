/**
 * Phase H — export bundle builder (H1).
 *
 * Pure builder. Given a Prisma client and a scope (FULL or per-CYCLE), it:
 *   1. fetches every row that belongs in the export,
 *   2. fetches every referenced storage blob (best-effort; failures land in
 *      the manifest as `status: "missing"` rather than aborting),
 *   3. produces an in-memory `ExportBundle` with one file per Prisma table,
 *      every blob mirrored under `storage/<storageKey>`, an `attachments.csv`
 *      operational summary, a human-readable `README.txt`, and a
 *      `manifest.json` that ties it all together with sha256 sums.
 *
 * Important: H1 does not zip or stream. The caller (a future route handler
 * in H2) is expected to bundle `ExportBundle.files` into a zip. We hold the
 * whole thing in memory; see `IN_MEMORY_EXPORT_SOFT_LIMIT_BYTES`.
 *
 * Excluded by design:
 *   - `AppSession`: auth-token hashes; ephemeral, no backup value.
 *   - `User.passwordHash`: kept for FULL (otherwise restore breaks login),
 *     replaced with the literal "REDACTED" for CYCLE scope (avoid leaking
 *     credentials when sharing one cycle for review).
 *   - `StaffSignupRequest`: not included in CYCLE scope; included in FULL.
 */
import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import type {
  ActorType,
  ExamCycle,
  PrismaClient,
  ScenarioFile,
  ScenarioTemplate,
  ScenarioTemplateAttachment,
  Session,
  SessionAttachment,
  SessionMessage
} from "@prisma/client";

import { getFileBuffer } from "@/lib/storage";

import { computeCycleClosure, type CycleClosure } from "./cycle-closure";

/**
 * Practical ceiling for the v1 in-memory path. If `ExportBundle.totalBytes`
 * exceeds this, a warning is appended to the manifest. Swap to a streaming
 * archiver (e.g. `archiver` or `jszip.generateNodeStream`) when real
 * exports approach the ceiling — this is documented but not auto-blocked.
 */
export const IN_MEMORY_EXPORT_SOFT_LIMIT_BYTES = 1_500_000_000;

export type ExportScope =
  | { type: "FULL" }
  | { type: "CYCLE"; cycleId: string };

export type BuildExportOptions = {
  scope: ExportScope;
  exportedByUserId: string | null;
};

export type ManifestStorageDetail = {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  linkedTo: { table: string; id: string };
  status: "ok" | "missing";
  error?: string;
};

export type ManifestFileEntry = {
  path: string;
  sha256: string | null;
  sizeBytes: number;
  kind: "database" | "csv" | "readme" | "storage";
  storage?: ManifestStorageDetail;
};

export type ExportManifest = {
  exportId: string;
  exportedAt: string;
  exportedByUserId: string | null;
  exportedByName: string | null;
  appVersion: string;
  schemaFingerprint: string;
  storageMode: "local" | "s3";
  dbHost: string;
  scope: ExportScope;
  counts: Record<string, number>;
  excluded: string[];
  files: ManifestFileEntry[];
  warnings: string[];
};

export type BundleFile = {
  path: string;
  content: Buffer;
};

export type ExportBundle = {
  manifest: ExportManifest;
  /** Includes `manifest.json` as the first entry, then every file listed in `manifest.files`. */
  files: BundleFile[];
  totalBytes: number;
};

type TableRows = {
  users: Array<Record<string, unknown> & { id: string }>;
  staffSignupRequests: unknown[];
  scenarios: unknown[];
  scenarioRoles: unknown[];
  scenarioTemplates: ScenarioTemplate[];
  scenarioTemplateAttachments: ScenarioTemplateAttachment[];
  scenarioFiles: ScenarioFile[];
  examCycles: ExamCycle[];
  examCycleStudents: unknown[];
  sessions: Session[];
  sessionMessages: SessionMessage[];
  sessionAttachments: SessionAttachment[];
  drafts: unknown[];
  auditLogs: unknown[];
};

type StorageRef = {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  linkedTo: { table: string; id: string };
  sessionId: string | null;
  cycleId: string | null;
  scenarioId: string | null;
  uploadedByType: ActorType | null;
  uploadedById: string | null;
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

function getStorageMode(): "local" | "s3" {
  return process.env.STORAGE_MODE === "s3" && process.env.STORAGE_BUCKET
    ? "s3"
    : "local";
}

function getDbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).hostname || "unknown";
  } catch {
    return "unknown";
  }
}

async function getSchemaFingerprint(): Promise<string> {
  try {
    const schema = await fs.readFile(
      path.join(process.cwd(), "prisma", "schema.prisma"),
      "utf8"
    );
    // Normalize CRLF → LF so the fingerprint is stable across platforms
    // (Windows working copies otherwise hash differently than Linux/CI).
    const normalized = schema.replace(/\r\n/g, "\n");
    return createHash("sha256").update(normalized).digest("hex");
  } catch {
    return "unknown";
  }
}

async function getAppVersion(): Promise<string> {
  try {
    const pkg = await fs.readFile(
      path.join(process.cwd(), "package.json"),
      "utf8"
    );
    const parsed = JSON.parse(pkg) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function fetchFullRows(prisma: PrismaClient): Promise<TableRows> {
  const [
    users,
    staffSignupRequests,
    scenarios,
    scenarioRoles,
    scenarioTemplates,
    scenarioTemplateAttachments,
    scenarioFiles,
    examCycles,
    examCycleStudents,
    sessions,
    sessionMessages,
    sessionAttachments,
    drafts,
    auditLogs
  ] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.staffSignupRequest.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.scenario.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.scenarioRole.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.scenarioTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.scenarioTemplateAttachment.findMany({
      orderBy: { createdAt: "asc" }
    }),
    prisma.scenarioFile.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.examCycle.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.examCycleStudent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.session.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.sessionMessage.findMany({ orderBy: { sentAt: "asc" } }),
    prisma.sessionAttachment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.draft.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })
  ]);

  return {
    users,
    staffSignupRequests,
    scenarios,
    scenarioRoles,
    scenarioTemplates,
    scenarioTemplateAttachments,
    scenarioFiles,
    examCycles,
    examCycleStudents,
    sessions,
    sessionMessages,
    sessionAttachments,
    drafts,
    auditLogs
  };
}

async function fetchCycleRows(
  prisma: PrismaClient,
  closure: CycleClosure
): Promise<TableRows> {
  const ids = {
    users: [...closure.userIds],
    scenarios: [...closure.scenarioIds],
    scenarioRoles: [...closure.scenarioRoleIds],
    scenarioTemplates: [...closure.scenarioTemplateIds],
    scenarioTemplateAttachments: [...closure.scenarioTemplateAttachmentIds],
    scenarioFiles: [...closure.scenarioFileIds],
    examCycles: [...closure.cycleIds],
    examCycleStudents: [...closure.cycleStudentIds],
    sessions: [...closure.sessionIds],
    sessionMessages: [...closure.sessionMessageIds],
    sessionAttachments: [...closure.sessionAttachmentIds],
    drafts: [...closure.draftIds],
    auditLogs: [...closure.auditLogIds]
  };

  const [
    users,
    scenarios,
    scenarioRoles,
    scenarioTemplates,
    scenarioTemplateAttachments,
    scenarioFiles,
    examCycles,
    examCycleStudents,
    sessions,
    sessionMessages,
    sessionAttachments,
    drafts,
    auditLogs
  ] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids.users } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.scenario.findMany({
      where: { id: { in: ids.scenarios } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.scenarioRole.findMany({
      where: { id: { in: ids.scenarioRoles } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.scenarioTemplate.findMany({
      where: { id: { in: ids.scenarioTemplates } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.scenarioTemplateAttachment.findMany({
      where: { id: { in: ids.scenarioTemplateAttachments } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.scenarioFile.findMany({
      where: { id: { in: ids.scenarioFiles } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.examCycle.findMany({
      where: { id: { in: ids.examCycles } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.examCycleStudent.findMany({
      where: { id: { in: ids.examCycleStudents } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.session.findMany({
      where: { id: { in: ids.sessions } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.sessionMessage.findMany({
      where: { id: { in: ids.sessionMessages } },
      orderBy: { sentAt: "asc" }
    }),
    prisma.sessionAttachment.findMany({
      where: { id: { in: ids.sessionAttachments } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.draft.findMany({
      where: { id: { in: ids.drafts } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.auditLog.findMany({
      where: { id: { in: ids.auditLogs } },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return {
    users,
    staffSignupRequests: [],
    scenarios,
    scenarioRoles,
    scenarioTemplates,
    scenarioTemplateAttachments,
    scenarioFiles,
    examCycles,
    examCycleStudents,
    sessions,
    sessionMessages,
    sessionAttachments,
    drafts,
    auditLogs
  };
}

function redactUserPasswords<T extends { id: string }>(users: T[]): T[] {
  return users.map((u) => ({ ...u, passwordHash: "REDACTED" }) as T);
}

function collectStorageRefs(rows: TableRows): StorageRef[] {
  const messageIdToSessionId = new Map<string, string>();
  for (const m of rows.sessionMessages) {
    messageIdToSessionId.set(m.id, m.sessionId);
  }
  const sessionIdToCycleId = new Map<string, string>();
  for (const s of rows.sessions) {
    sessionIdToCycleId.set(s.id, s.examCycleId);
  }
  const cycleIdToScenarioId = new Map<string, string>();
  for (const c of rows.examCycles) {
    cycleIdToScenarioId.set(c.id, c.scenarioId);
  }
  const templateIdToScenarioId = new Map<string, string>();
  for (const t of rows.scenarioTemplates) {
    templateIdToScenarioId.set(t.id, t.scenarioId);
  }

  const refs: StorageRef[] = [];

  for (const a of rows.sessionAttachments) {
    const sessionId = messageIdToSessionId.get(a.messageId) ?? null;
    const cycleId = sessionId ? sessionIdToCycleId.get(sessionId) ?? null : null;
    const scenarioId = cycleId
      ? cycleIdToScenarioId.get(cycleId) ?? null
      : null;
    refs.push({
      storageKey: a.storageKey,
      originalFileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      linkedTo: { table: "SessionAttachment", id: a.id },
      sessionId,
      cycleId,
      scenarioId,
      uploadedByType: a.uploadedByType,
      uploadedById: a.uploadedById
    });
  }

  for (const a of rows.scenarioTemplateAttachments) {
    const scenarioId = templateIdToScenarioId.get(a.templateId) ?? null;
    refs.push({
      storageKey: a.storageKey,
      originalFileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      linkedTo: { table: "ScenarioTemplateAttachment", id: a.id },
      sessionId: null,
      cycleId: null,
      scenarioId,
      uploadedByType: null,
      uploadedById: null
    });
  }

  for (const f of rows.scenarioFiles) {
    if (!f.storageKey || !f.fileName || !f.mimeType) continue;
    refs.push({
      storageKey: f.storageKey,
      originalFileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes ?? 0,
      linkedTo: { table: "ScenarioFile", id: f.id },
      sessionId: null,
      cycleId: null,
      scenarioId: f.scenarioId,
      uploadedByType: f.uploadedByUserId ? "STAFF" : null,
      uploadedById: f.uploadedByUserId
    });
  }

  refs.sort((a, b) => a.storageKey.localeCompare(b.storageKey));
  return refs;
}

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildAttachmentsCsv(
  refs: StorageRef[],
  sha256ByKey: Map<string, string | null>
): string {
  const header = [
    "storageKey",
    "fileName",
    "mimeType",
    "sizeBytes",
    "sha256",
    "linkedTable",
    "linkedId",
    "sessionId",
    "cycleId",
    "scenarioId",
    "uploadedByType",
    "uploadedById"
  ];
  const lines = [header.join(",")];
  for (const r of refs) {
    lines.push(
      [
        r.storageKey,
        r.originalFileName,
        r.mimeType,
        String(r.sizeBytes),
        sha256ByKey.get(r.storageKey) ?? "",
        r.linkedTo.table,
        r.linkedTo.id,
        r.sessionId ?? "",
        r.cycleId ?? "",
        r.scenarioId ?? "",
        r.uploadedByType ?? "",
        r.uploadedById ?? ""
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

function buildReadme(manifest: ExportManifest): string {
  const lines: string[] = [
    "Weizmann Mail — export bundle",
    "==============================",
    "",
    `Export ID:     ${manifest.exportId}`,
    `Exported at:   ${manifest.exportedAt}`,
    `Exported by:   ${manifest.exportedByName ?? "(unknown)"} (${manifest.exportedByUserId ?? "no user id"})`,
    `App version:   ${manifest.appVersion}`,
    `Schema hash:   ${manifest.schemaFingerprint}`,
    `Storage mode:  ${manifest.storageMode}`,
    `Source DB:     ${manifest.dbHost}`,
    `Scope:         ${manifest.scope.type}${
      manifest.scope.type === "CYCLE"
        ? ` (cycleId=${manifest.scope.cycleId})`
        : ""
    }`,
    "",
    "Contents:",
    "  manifest.json        — authoritative file index with sha256 sums",
    "  database/            — one JSON file per Prisma table (flat rows)",
    "  storage/             — every referenced blob, keyed by storageKey",
    "  attachments.csv      — operational summary of every blob",
    "  README.txt           — this file",
    "",
    "Excluded:",
    ...manifest.excluded.map((e) => `  - ${e}`),
    "",
    "Restore:",
    "  This bundle is intended for backup/recovery. A restore script is",
    "  not yet shipped; the bundle is structured so a future script can:",
    "    1. Verify each file against manifest.json sha256 sums.",
    "    2. Refuse if schemaFingerprint does not match the target schema.",
    "    3. Insert rows table-by-table in dependency order.",
    "    4. Re-upload storage/ blobs under their original storageKey.",
    "",
    "Sensitivity:",
    "  This bundle contains candidate PII (names, government IDs, exam",
    "  answers, attachments). Treat as confidential. Do not email or",
    "  upload to third-party services."
  ];

  if (manifest.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings recorded during export:");
    for (const w of manifest.warnings) lines.push(`  - ${w}`);
  }

  lines.push("");
  return lines.join("\n");
}

const DATABASE_FILES: Array<{ name: string; rowsKey: keyof TableRows }> = [
  { name: "users.json", rowsKey: "users" },
  { name: "staff_signup_requests.json", rowsKey: "staffSignupRequests" },
  { name: "scenarios.json", rowsKey: "scenarios" },
  { name: "scenario_roles.json", rowsKey: "scenarioRoles" },
  { name: "scenario_templates.json", rowsKey: "scenarioTemplates" },
  {
    name: "scenario_template_attachments.json",
    rowsKey: "scenarioTemplateAttachments"
  },
  { name: "scenario_files.json", rowsKey: "scenarioFiles" },
  { name: "exam_cycles.json", rowsKey: "examCycles" },
  { name: "exam_cycle_students.json", rowsKey: "examCycleStudents" },
  { name: "sessions.json", rowsKey: "sessions" },
  { name: "session_messages.json", rowsKey: "sessionMessages" },
  { name: "session_attachments.json", rowsKey: "sessionAttachments" },
  { name: "drafts.json", rowsKey: "drafts" },
  { name: "audit_logs.json", rowsKey: "auditLogs" }
];

export async function buildExport(
  prisma: PrismaClient,
  options: BuildExportOptions
): Promise<ExportBundle> {
  const exportId = randomUUID();
  const exportedAt = new Date().toISOString();

  let exportedByName: string | null = null;
  if (options.exportedByUserId) {
    const user = await prisma.user.findUnique({
      where: { id: options.exportedByUserId },
      select: { fullName: true }
    });
    exportedByName = user?.fullName ?? null;
  }

  const closure =
    options.scope.type === "CYCLE"
      ? await computeCycleClosure(prisma, options.scope.cycleId)
      : null;

  let rows =
    options.scope.type === "FULL"
      ? await fetchFullRows(prisma)
      : await fetchCycleRows(prisma, closure as CycleClosure);

  if (options.scope.type === "CYCLE") {
    rows = { ...rows, users: redactUserPasswords(rows.users) };
  }

  // Database JSON files (deterministic order).
  const databaseFiles: BundleFile[] = DATABASE_FILES.map(({ name, rowsKey }) => ({
    path: `database/${name}`,
    content: jsonBuffer(rows[rowsKey])
  }));
  const databaseEntries: ManifestFileEntry[] = databaseFiles.map((f) => ({
    path: f.path,
    sha256: sha256(f.content),
    sizeBytes: f.content.byteLength,
    kind: "database"
  }));

  // Storage blobs — best-effort fetch, missing entries documented.
  const refs = collectStorageRefs(rows);
  const sha256ByKey = new Map<string, string | null>();
  const storageFiles: BundleFile[] = [];
  const storageEntries: ManifestFileEntry[] = [];
  const warnings: string[] = [];

  for (const ref of refs) {
    const bundlePath = `storage/${ref.storageKey}`;
    try {
      const buf = await getFileBuffer(ref.storageKey);
      const hash = sha256(buf);
      sha256ByKey.set(ref.storageKey, hash);
      storageFiles.push({ path: bundlePath, content: buf });
      storageEntries.push({
        path: bundlePath,
        sha256: hash,
        sizeBytes: buf.byteLength,
        kind: "storage",
        storage: {
          storageKey: ref.storageKey,
          originalFileName: ref.originalFileName,
          mimeType: ref.mimeType,
          linkedTo: ref.linkedTo,
          status: "ok"
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sha256ByKey.set(ref.storageKey, null);
      storageEntries.push({
        path: bundlePath,
        sha256: null,
        sizeBytes: 0,
        kind: "storage",
        storage: {
          storageKey: ref.storageKey,
          originalFileName: ref.originalFileName,
          mimeType: ref.mimeType,
          linkedTo: ref.linkedTo,
          status: "missing",
          error: msg
        }
      });
      warnings.push(
        `Could not fetch storage key ${ref.storageKey} (${ref.linkedTo.table}#${ref.linkedTo.id}): ${msg}`
      );
    }
  }

  // attachments.csv — operational summary.
  const csvBuffer = Buffer.from(
    buildAttachmentsCsv(refs, sha256ByKey),
    "utf8"
  );
  const csvFile: BundleFile = { path: "attachments.csv", content: csvBuffer };
  const csvEntry: ManifestFileEntry = {
    path: csvFile.path,
    sha256: sha256(csvBuffer),
    sizeBytes: csvBuffer.byteLength,
    kind: "csv"
  };

  // Counts.
  const counts: Record<string, number> = {
    users: rows.users.length,
    staffSignupRequests: rows.staffSignupRequests.length,
    scenarios: rows.scenarios.length,
    scenarioRoles: rows.scenarioRoles.length,
    scenarioTemplates: rows.scenarioTemplates.length,
    scenarioTemplateAttachments: rows.scenarioTemplateAttachments.length,
    scenarioFiles: rows.scenarioFiles.length,
    examCycles: rows.examCycles.length,
    examCycleStudents: rows.examCycleStudents.length,
    sessions: rows.sessions.length,
    sessionMessages: rows.sessionMessages.length,
    sessionAttachments: rows.sessionAttachments.length,
    drafts: rows.drafts.length,
    auditLogs: rows.auditLogs.length,
    storageFilesOk: storageEntries.filter(
      (e) => e.storage?.status === "ok"
    ).length,
    storageFilesMissing: storageEntries.filter(
      (e) => e.storage?.status === "missing"
    ).length
  };

  const excluded = ["AppSession (auth tokens, intentionally not exported)"];
  if (options.scope.type === "CYCLE") {
    excluded.push(
      "User.passwordHash replaced with \"REDACTED\" (CYCLE scope)"
    );
    excluded.push("StaffSignupRequest (not in CYCLE scope)");
  }

  // Total size check (informational warning, not a hard stop).
  const nonManifestSize =
    databaseFiles.reduce((s, f) => s + f.content.byteLength, 0) +
    storageFiles.reduce((s, f) => s + f.content.byteLength, 0) +
    csvBuffer.byteLength;
  if (nonManifestSize > IN_MEMORY_EXPORT_SOFT_LIMIT_BYTES) {
    warnings.push(
      `Bundle size ${nonManifestSize} bytes exceeds the in-memory v1 ceiling of ${IN_MEMORY_EXPORT_SOFT_LIMIT_BYTES} bytes; switch to a streaming archiver.`
    );
  }

  // README depends on the (mostly) finalized manifest.
  const manifestForReadme: ExportManifest = {
    exportId,
    exportedAt,
    exportedByUserId: options.exportedByUserId,
    exportedByName,
    appVersion: await getAppVersion(),
    schemaFingerprint: await getSchemaFingerprint(),
    storageMode: getStorageMode(),
    dbHost: getDbHost(),
    scope: options.scope,
    counts,
    excluded,
    files: [],
    warnings
  };
  const readmeBuffer = Buffer.from(buildReadme(manifestForReadme), "utf8");
  const readmeFile: BundleFile = { path: "README.txt", content: readmeBuffer };
  const readmeEntry: ManifestFileEntry = {
    path: readmeFile.path,
    sha256: sha256(readmeBuffer),
    sizeBytes: readmeBuffer.byteLength,
    kind: "readme"
  };

  // Final manifest — `files` does NOT include manifest.json itself
  // (a file cannot authoritatively hash itself; manifest.json is the
  // index, not an indexed file).
  const manifest: ExportManifest = {
    ...manifestForReadme,
    files: [readmeEntry, csvEntry, ...databaseEntries, ...storageEntries]
  };

  const manifestBuffer = jsonBuffer(manifest);
  const manifestFile: BundleFile = {
    path: "manifest.json",
    content: manifestBuffer
  };

  const files: BundleFile[] = [
    manifestFile,
    readmeFile,
    csvFile,
    ...databaseFiles,
    ...storageFiles
  ];
  const totalBytes = files.reduce((s, f) => s + f.content.byteLength, 0);

  return { manifest, files, totalBytes };
}
