/**
 * Phase H4 — restore from an H1/H2 export bundle.
 *
 * Inverse of src/lib/export/build-export.ts. Reads an export bundle (a
 * .zip produced by /api/admin/export), verifies it, then rebuilds the
 * database and storage to match the snapshot. Dry-run by default.
 *
 * Greenfield-only: refuses to run if any bundle row id already exists
 * in the target DB. Run scripts/reset-qa-data.ts first if you need to
 * clear conflicts.
 *
 * SAFETY HARNESS (mirrors scripts/reset-qa-data.ts):
 *   ALLOW_RESTORE=true             must be set
 *   --bundle <path>                must point at a readable .zip
 *   --confirm "<phrase>"           must match the phrase printed by the
 *                                  most recent dry-run for this
 *                                  (bundle, target) pair
 *   --execute                      must be passed (otherwise dry-run)
 *   --i-understand-production      required for non-localhost DB hosts
 *
 * REFUSALS (no override unless noted):
 *   - Bundle missing or unreadable
 *   - manifest.json missing or malformed
 *   - Any sha256 mismatch in manifest entries
 *   - Schema fingerprint mismatch        (override: --accept-schema-mismatch)
 *   - Bundle scope = CYCLE               (override: --allow-cycle-scope-restore;
 *                                         auth WILL be broken — passwordHash
 *                                         is "REDACTED")
 *   - Target DB has overlapping row ids  (no override — reset first)
 *   - Target storage has overlapping keys (override: --allow-storage-overwrite)
 *   - Any ExamCycle in target DB has status=LIVE  (no override)
 *
 * EXECUTION:
 *   Phase B: single $transaction, FK-ordered createMany() per table.
 *            SessionMessage is two-pass because of the replyToId self-FK
 *            (insert with replyToId=null, then per-row update).
 *   Phase C: storage uploads via saveFileAtKey(), OUTSIDE the DB
 *            transaction, best-effort. status=missing entries are
 *            skipped (the inserted DB rows then reference nothing,
 *            mirroring the source state at export time).
 *
 * Does NOT reseed, does NOT touch AppSession (everyone re-logs in),
 * does NOT run migrations.
 *
 * For real-cycle restores (~200 candidates), test against
 * localhost/staging first — see CLAUDE.md "Restore from export".
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import {
  ExamCycleStatus,
  Prisma,
  PrismaClient
} from "@prisma/client";
import JSZip from "jszip";

import {
  fileExistsAtKey,
  saveFileAtKey
} from "../src/lib/storage";

const prisma = new PrismaClient();

const DEFAULT_DB_TIMEOUT_MS = 5 * 60 * 1000;
const INSERT_CHUNK_SIZE = 500;

// Tables that live in the bundle and the database/<name>.json filename
// for each. Order is FK dependency order — DO NOT reorder without a
// careful read of prisma/schema.prisma.
const TABLE_ORDER = [
  "users",
  "staff_signup_requests",
  "scenarios",
  "scenario_roles",
  "scenario_templates",
  "scenario_template_attachments",
  "scenario_files",
  "exam_cycles",
  "exam_cycle_students",
  "sessions",
  "session_messages",
  "session_attachments",
  "drafts",
  "audit_logs"
] as const;

type TableName = (typeof TABLE_ORDER)[number];

// Per-table list of fields whose JSON value is an ISO string that must
// be revived to a Date object before being handed to Prisma. When
// adding a DateTime column to schema.prisma, ALSO add it here.
const DATE_FIELDS_BY_TABLE: Record<TableName, string[]> = {
  users: ["createdAt", "updatedAt"],
  staff_signup_requests: ["createdAt", "reviewedAt"],
  scenarios: ["createdAt", "updatedAt"],
  scenario_roles: ["createdAt"],
  scenario_templates: ["createdAt", "updatedAt"],
  scenario_template_attachments: ["createdAt"],
  scenario_files: ["createdAt"],
  exam_cycles: ["scheduledFor", "createdAt", "updatedAt"],
  exam_cycle_students: [
    "claimedAt",
    "readyAt",
    "activatedAt",
    "completedAt",
    "createdAt",
    "updatedAt"
  ],
  sessions: [
    "introAcknowledgedAt",
    "startedAt",
    "endsAt",
    "endedAt",
    "createdAt",
    "updatedAt"
  ],
  session_messages: [
    "resolvedAt",
    "deletedByStaffAt",
    "deletedByStudentAt",
    "sentAt"
  ],
  session_attachments: ["createdAt"],
  drafts: ["createdAt", "updatedAt"],
  audit_logs: ["createdAt"]
};

type Args = {
  bundle: string | null;
  execute: boolean;
  confirm: string | null;
  iUnderstandProduction: boolean;
  acceptSchemaMismatch: boolean;
  allowCycleScopeRestore: boolean;
  allowStorageOverwrite: boolean;
  dbTimeoutMs: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    bundle: null,
    execute: false,
    confirm: null,
    iUnderstandProduction: false,
    acceptSchemaMismatch: false,
    allowCycleScopeRestore: false,
    allowStorageOverwrite: false,
    dbTimeoutMs: DEFAULT_DB_TIMEOUT_MS
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    switch (token) {
      case "--bundle": {
        const next = argv[++i];
        if (!next) {
          console.error("--bundle requires a path argument.");
          process.exit(2);
        }
        args.bundle = next;
        break;
      }
      case "--execute":
        args.execute = true;
        break;
      case "--confirm": {
        const next = argv[++i];
        if (!next) {
          console.error("--confirm requires a phrase argument.");
          process.exit(2);
        }
        args.confirm = next;
        break;
      }
      case "--i-understand-production":
        args.iUnderstandProduction = true;
        break;
      case "--accept-schema-mismatch":
        args.acceptSchemaMismatch = true;
        break;
      case "--allow-cycle-scope-restore":
        args.allowCycleScopeRestore = true;
        break;
      case "--allow-storage-overwrite":
        args.allowStorageOverwrite = true;
        break;
      case "--db-timeout-ms": {
        const next = argv[++i];
        const parsed = Number(next);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          console.error(
            `--db-timeout-ms requires a positive number (got: ${next}).`
          );
          process.exit(2);
        }
        args.dbTimeoutMs = parsed;
        break;
      }
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${token}`);
        printHelp();
        process.exit(2);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Restore from export bundle.

Usage:
  ALLOW_RESTORE=true npx tsx scripts/restore-export.ts --bundle <path> [flags]

Common flows:
  Dry-run (always safe — no writes):
    ALLOW_RESTORE=true npx tsx scripts/restore-export.ts --bundle ./backup.zip

  Execute locally (FULL bundle):
    ALLOW_RESTORE=true npx tsx scripts/restore-export.ts \\
      --bundle ./backup.zip \\
      --confirm "RESTORE FROM backup.zip INTO localhost AT YYYY-MM-DDTHH:MMZ" \\
      --execute

  Against a non-local DB:
    ... --execute --i-understand-production

Override flags (use sparingly — read the dry-run output first):
  --accept-schema-mismatch        proceed even if prisma/schema.prisma has
                                  changed since the bundle was made
  --allow-cycle-scope-restore     restore a CYCLE-scope bundle; auth WILL
                                  be broken (User.passwordHash is REDACTED
                                  in CYCLE bundles) — every user must have
                                  their password reset before they can sign
                                  in again
  --allow-storage-overwrite       overwrite existing objects in storage at
                                  the bundle's storageKeys
  --db-timeout-ms <ms>            override the DB transaction timeout
                                  (default: ${DEFAULT_DB_TIMEOUT_MS} = 5 min)

Other:
  --execute                       actually write (otherwise dry-run)
  --i-understand-production       required if DB host is not localhost
  --confirm "<phrase>"            required for --execute; phrase printed
                                  by the dry-run
`);
}

// -------------------------------------------------------------------- //
// Manifest types — minimal shape, kept in sync with build-export.ts.
// -------------------------------------------------------------------- //

type ManifestStorageDetail = {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  linkedTo: { table: string; id: string };
  status: "ok" | "missing";
  error?: string;
};

type ManifestFileEntry = {
  path: string;
  sha256: string | null;
  sizeBytes: number;
  kind: "database" | "csv" | "readme" | "storage";
  storage?: ManifestStorageDetail;
};

type ExportManifest = {
  exportId: string;
  exportedAt: string;
  exportedByUserId: string | null;
  exportedByName: string | null;
  appVersion: string;
  schemaFingerprint: string;
  storageMode: "local" | "s3";
  dbHost: string;
  scope: { type: "FULL" } | { type: "CYCLE"; cycleId: string };
  counts: Record<string, number>;
  excluded: string[];
  files: ManifestFileEntry[];
  warnings: string[];
};

// -------------------------------------------------------------------- //
// Utilities
// -------------------------------------------------------------------- //

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function parseDbHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname || "<unknown>";
  } catch {
    return "<unparsable>";
  }
}

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "host.docker.internal"
  );
}

function buildConfirmPhrase(
  bundleBasename: string,
  host: string,
  now: Date
): string {
  const iso = now.toISOString().slice(0, 16) + "Z";
  return `RESTORE FROM ${bundleBasename} INTO ${host} AT ${iso}`;
}

async function readSchemaFingerprint(): Promise<string> {
  const schema = await fs.readFile(
    path.join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );
  // Normalize CRLF → LF so the fingerprint is stable across platforms
  // (Windows working copies otherwise hash differently than Linux/CI).
  const normalized = schema.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

function reviveDates(
  row: Record<string, unknown>,
  dateFields: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const f of dateFields) {
    const v = out[f];
    if (typeof v === "string") {
      out[f] = new Date(v);
    }
  }
  return out;
}

// -------------------------------------------------------------------- //
// Bundle loading & verification
// -------------------------------------------------------------------- //

type LoadedBundle = {
  zip: JSZip;
  manifest: ExportManifest;
  databaseRows: Record<TableName, Record<string, unknown>[]>;
};

async function loadBundle(bundlePath: string): Promise<LoadedBundle> {
  let zipBytes: Buffer;
  try {
    zipBytes = await fs.readFile(bundlePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read bundle file ${bundlePath}: ${msg}`);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Not a valid zip file: ${msg}`);
  }

  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) {
    throw new Error("Bundle is missing manifest.json");
  }
  const manifestText = await manifestEntry.async("string");
  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(manifestText) as ExportManifest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`manifest.json is not valid JSON: ${msg}`);
  }

  const databaseRows = {} as Record<TableName, Record<string, unknown>[]>;
  for (const table of TABLE_ORDER) {
    const dbPath = `database/${table}.json`;
    const entry = zip.file(dbPath);
    if (!entry) {
      databaseRows[table] = [];
      continue;
    }
    const text = await entry.async("string");
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error(`${dbPath} is not an array`);
      }
      databaseRows[table] = parsed as Record<string, unknown>[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse ${dbPath}: ${msg}`);
    }
  }

  return { zip, manifest, databaseRows };
}

async function verifyBundleIntegrity(
  bundle: LoadedBundle
): Promise<{ ok: boolean; mismatches: string[]; checked: number }> {
  const mismatches: string[] = [];
  let checked = 0;
  for (const entry of bundle.manifest.files) {
    if (entry.sha256 == null) continue;
    const zipEntry = bundle.zip.file(entry.path);
    if (!zipEntry) {
      mismatches.push(`${entry.path}: missing from zip`);
      continue;
    }
    const buf = await zipEntry.async("nodebuffer");
    const actual = sha256(buf);
    checked++;
    if (actual !== entry.sha256) {
      mismatches.push(
        `${entry.path}: expected ${entry.sha256}, got ${actual}`
      );
    }
  }
  return { ok: mismatches.length === 0, mismatches, checked };
}

// -------------------------------------------------------------------- //
// Pre-flight against the target DB / storage
// -------------------------------------------------------------------- //

async function detectLiveCycles(): Promise<Array<{ id: string; name: string }>> {
  return prisma.examCycle.findMany({
    where: { status: ExamCycleStatus.LIVE },
    select: { id: true, name: true }
  });
}

type IdConflicts = {
  total: number;
  byTable: Record<string, number>;
  samples: string[];
};

async function detectDbIdConflicts(
  bundle: LoadedBundle
): Promise<IdConflicts> {
  const out: IdConflicts = { total: 0, byTable: {}, samples: [] };

  const checks: Array<{
    table: TableName;
    ids: string[];
    count: (chunk: string[]) => Promise<number>;
  }> = [
    {
      table: "users",
      ids: bundle.databaseRows.users.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.user.count({ where: { id: { in: chunk } } })
    },
    {
      table: "staff_signup_requests",
      ids: bundle.databaseRows.staff_signup_requests.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.staffSignupRequest.count({ where: { id: { in: chunk } } })
    },
    {
      table: "scenarios",
      ids: bundle.databaseRows.scenarios.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.scenario.count({ where: { id: { in: chunk } } })
    },
    {
      table: "scenario_roles",
      ids: bundle.databaseRows.scenario_roles.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.scenarioRole.count({ where: { id: { in: chunk } } })
    },
    {
      table: "scenario_templates",
      ids: bundle.databaseRows.scenario_templates.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.scenarioTemplate.count({ where: { id: { in: chunk } } })
    },
    {
      table: "scenario_template_attachments",
      ids: bundle.databaseRows.scenario_template_attachments.map((r) =>
        String(r.id)
      ),
      count: (chunk) =>
        prisma.scenarioTemplateAttachment.count({
          where: { id: { in: chunk } }
        })
    },
    {
      table: "scenario_files",
      ids: bundle.databaseRows.scenario_files.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.scenarioFile.count({ where: { id: { in: chunk } } })
    },
    {
      table: "exam_cycles",
      ids: bundle.databaseRows.exam_cycles.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.examCycle.count({ where: { id: { in: chunk } } })
    },
    {
      table: "exam_cycle_students",
      ids: bundle.databaseRows.exam_cycle_students.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.examCycleStudent.count({ where: { id: { in: chunk } } })
    },
    {
      table: "sessions",
      ids: bundle.databaseRows.sessions.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.session.count({ where: { id: { in: chunk } } })
    },
    {
      table: "session_messages",
      ids: bundle.databaseRows.session_messages.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.sessionMessage.count({ where: { id: { in: chunk } } })
    },
    {
      table: "session_attachments",
      ids: bundle.databaseRows.session_attachments.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.sessionAttachment.count({ where: { id: { in: chunk } } })
    },
    {
      table: "drafts",
      ids: bundle.databaseRows.drafts.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.draft.count({ where: { id: { in: chunk } } })
    },
    {
      table: "audit_logs",
      ids: bundle.databaseRows.audit_logs.map((r) => String(r.id)),
      count: (chunk) =>
        prisma.auditLog.count({ where: { id: { in: chunk } } })
    }
  ];

  for (const check of checks) {
    if (check.ids.length === 0) continue;
    let tableTotal = 0;
    for (let i = 0; i < check.ids.length; i += 1000) {
      const chunk = check.ids.slice(i, i + 1000);
      tableTotal += await check.count(chunk);
    }
    if (tableTotal > 0) {
      out.byTable[check.table] = tableTotal;
      out.total += tableTotal;
      if (out.samples.length < 10) {
        out.samples.push(`${check.table}: ${tableTotal} colliding row(s)`);
      }
    }
  }

  return out;
}

async function detectStorageConflicts(
  bundle: LoadedBundle
): Promise<{ total: number; samples: string[] }> {
  // Distinct keys only — the manifest lists one entry per DB row that
  // references a blob, so the same storageKey can appear N times when
  // preloaded template attachments are propagated across sessions.
  const keys = [
    ...new Set(
      bundle.manifest.files
        .filter((f) => f.kind === "storage" && f.storage?.status === "ok")
        .map((f) => f.storage!.storageKey)
    )
  ];

  let total = 0;
  const samples: string[] = [];
  const CONCURRENCY = 16;
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const chunk = keys.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (k) => ({ key: k, exists: await fileExistsAtKey(k) }))
    );
    for (const r of results) {
      if (r.exists) {
        total++;
        if (samples.length < 10) samples.push(r.key);
      }
    }
  }
  return { total, samples };
}

// -------------------------------------------------------------------- //
// Phase B — DB inserts inside a single transaction
// -------------------------------------------------------------------- //

async function chunkedCreateMany<T extends Record<string, unknown>>(
  rows: T[],
  insert: (chunk: T[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const result = await insert(chunk);
    total += result.count;
  }
  return total;
}

function prepareRows<TName extends TableName>(
  table: TName,
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  const dateFields = DATE_FIELDS_BY_TABLE[table];
  return rows.map((r) => reviveDates(r, dateFields));
}

async function runDbInserts(
  bundle: LoadedBundle,
  args: Args
): Promise<Record<TableName, number>> {
  const inserted: Record<TableName, number> = {
    users: 0,
    staff_signup_requests: 0,
    scenarios: 0,
    scenario_roles: 0,
    scenario_templates: 0,
    scenario_template_attachments: 0,
    scenario_files: 0,
    exam_cycles: 0,
    exam_cycle_students: 0,
    sessions: 0,
    session_messages: 0,
    session_attachments: 0,
    drafts: 0,
    audit_logs: 0
  };

  await prisma.$transaction(
    async (tx) => {
      // 1. User
      inserted.users = await chunkedCreateMany(
        prepareRows("users", bundle.databaseRows.users),
        (chunk) =>
          tx.user.createMany({
            data: chunk as unknown as Prisma.UserCreateManyInput[]
          })
      );

      // 2. StaffSignupRequest
      inserted.staff_signup_requests = await chunkedCreateMany(
        prepareRows(
          "staff_signup_requests",
          bundle.databaseRows.staff_signup_requests
        ),
        (chunk) =>
          tx.staffSignupRequest.createMany({
            data: chunk as unknown as Prisma.StaffSignupRequestCreateManyInput[]
          })
      );

      // 3. Scenario
      inserted.scenarios = await chunkedCreateMany(
        prepareRows("scenarios", bundle.databaseRows.scenarios),
        (chunk) =>
          tx.scenario.createMany({
            data: chunk as unknown as Prisma.ScenarioCreateManyInput[]
          })
      );

      // 4. ScenarioRole
      inserted.scenario_roles = await chunkedCreateMany(
        prepareRows("scenario_roles", bundle.databaseRows.scenario_roles),
        (chunk) =>
          tx.scenarioRole.createMany({
            data: chunk as unknown as Prisma.ScenarioRoleCreateManyInput[]
          })
      );

      // 5. ScenarioTemplate
      inserted.scenario_templates = await chunkedCreateMany(
        prepareRows(
          "scenario_templates",
          bundle.databaseRows.scenario_templates
        ),
        (chunk) =>
          tx.scenarioTemplate.createMany({
            data: chunk as unknown as Prisma.ScenarioTemplateCreateManyInput[]
          })
      );

      // 6. ScenarioTemplateAttachment
      inserted.scenario_template_attachments = await chunkedCreateMany(
        prepareRows(
          "scenario_template_attachments",
          bundle.databaseRows.scenario_template_attachments
        ),
        (chunk) =>
          tx.scenarioTemplateAttachment.createMany({
            data: chunk as unknown as Prisma.ScenarioTemplateAttachmentCreateManyInput[]
          })
      );

      // 7. ScenarioFile
      inserted.scenario_files = await chunkedCreateMany(
        prepareRows("scenario_files", bundle.databaseRows.scenario_files),
        (chunk) =>
          tx.scenarioFile.createMany({
            data: chunk as unknown as Prisma.ScenarioFileCreateManyInput[]
          })
      );

      // 8. ExamCycle
      inserted.exam_cycles = await chunkedCreateMany(
        prepareRows("exam_cycles", bundle.databaseRows.exam_cycles),
        (chunk) =>
          tx.examCycle.createMany({
            data: chunk as unknown as Prisma.ExamCycleCreateManyInput[]
          })
      );

      // 9. ExamCycleStudent
      inserted.exam_cycle_students = await chunkedCreateMany(
        prepareRows(
          "exam_cycle_students",
          bundle.databaseRows.exam_cycle_students
        ),
        (chunk) =>
          tx.examCycleStudent.createMany({
            data: chunk as unknown as Prisma.ExamCycleStudentCreateManyInput[]
          })
      );

      // 10. Session
      inserted.sessions = await chunkedCreateMany(
        prepareRows("sessions", bundle.databaseRows.sessions),
        (chunk) =>
          tx.session.createMany({
            data: chunk as unknown as Prisma.SessionCreateManyInput[]
          })
      );

      // 11. SessionMessage — TWO PASS for self-FK on replyToId.
      const messagesPreparedAll = prepareRows(
        "session_messages",
        bundle.databaseRows.session_messages
      );
      const messagesPass1 = messagesPreparedAll.map((m) => ({
        ...m,
        replyToId: null
      }));
      inserted.session_messages = await chunkedCreateMany(
        messagesPass1,
        (chunk) =>
          tx.sessionMessage.createMany({
            data: chunk as unknown as Prisma.SessionMessageCreateManyInput[]
          })
      );
      const messagesNeedingReply = messagesPreparedAll.filter(
        (m) => m.replyToId != null
      );
      for (const m of messagesNeedingReply) {
        await tx.sessionMessage.update({
          where: { id: String(m.id) },
          data: { replyToId: String(m.replyToId) }
        });
      }

      // 12. SessionAttachment
      inserted.session_attachments = await chunkedCreateMany(
        prepareRows(
          "session_attachments",
          bundle.databaseRows.session_attachments
        ),
        (chunk) =>
          tx.sessionAttachment.createMany({
            data: chunk as unknown as Prisma.SessionAttachmentCreateManyInput[]
          })
      );

      // 13. Draft
      inserted.drafts = await chunkedCreateMany(
        prepareRows("drafts", bundle.databaseRows.drafts),
        (chunk) =>
          tx.draft.createMany({
            data: chunk as unknown as Prisma.DraftCreateManyInput[]
          })
      );

      // 14. AuditLog
      inserted.audit_logs = await chunkedCreateMany(
        prepareRows("audit_logs", bundle.databaseRows.audit_logs),
        (chunk) =>
          tx.auditLog.createMany({
            data: chunk as unknown as Prisma.AuditLogCreateManyInput[]
          })
      );
    },
    {
      timeout: args.dbTimeoutMs,
      maxWait: 10_000
    }
  );

  return inserted;
}

// -------------------------------------------------------------------- //
// Phase C — storage uploads outside the DB transaction
// -------------------------------------------------------------------- //

type StorageResult = {
  uploaded: number;
  failed: number;
  skippedMissing: number;
  failures: Array<{ key: string; reason: string }>;
};

async function runStorageUploads(
  bundle: LoadedBundle
): Promise<StorageResult> {
  const out: StorageResult = {
    uploaded: 0,
    failed: 0,
    skippedMissing: 0,
    failures: []
  };

  // Dedupe by storageKey — the same blob can be referenced by many DB
  // rows (preloaded propagation). The bundle stores it once; upload it
  // once.
  const seen = new Set<string>();
  for (const entry of bundle.manifest.files) {
    if (entry.kind !== "storage" || !entry.storage) continue;

    if (entry.storage.status === "missing") {
      if (!seen.has(entry.storage.storageKey)) {
        seen.add(entry.storage.storageKey);
        out.skippedMissing++;
      }
      continue;
    }

    if (seen.has(entry.storage.storageKey)) continue;
    seen.add(entry.storage.storageKey);

    const zipEntry = bundle.zip.file(entry.path);
    if (!zipEntry) {
      out.failed++;
      out.failures.push({
        key: entry.storage.storageKey,
        reason: "zip entry missing"
      });
      continue;
    }

    const buf = await zipEntry.async("nodebuffer");
    const hash = sha256(buf);
    if (entry.sha256 != null && hash !== entry.sha256) {
      out.failed++;
      out.failures.push({
        key: entry.storage.storageKey,
        reason: "sha256 mismatch on upload re-check"
      });
      continue;
    }

    try {
      await saveFileAtKey(
        entry.storage.storageKey,
        buf,
        entry.storage.mimeType
      );
      out.uploaded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.failed++;
      out.failures.push({ key: entry.storage.storageKey, reason: msg });
    }
  }

  return out;
}

// -------------------------------------------------------------------- //
// Output helpers
// -------------------------------------------------------------------- //

function printManifestSummary(manifest: ExportManifest): void {
  console.log("Bundle");
  console.log(`  Export ID:     ${manifest.exportId}`);
  console.log(`  Exported at:   ${manifest.exportedAt}`);
  console.log(
    `  Exported by:   ${manifest.exportedByName ?? "(unknown)"} (${
      manifest.exportedByUserId ?? "no user id"
    })`
  );
  console.log(`  App version:   ${manifest.appVersion}`);
  console.log(`  Schema hash:   ${manifest.schemaFingerprint}`);
  console.log(`  Source DB:     ${manifest.dbHost}`);
  console.log(`  Storage mode:  ${manifest.storageMode}`);
  console.log(
    `  Scope:         ${manifest.scope.type}${
      manifest.scope.type === "CYCLE"
        ? ` (cycleId=${manifest.scope.cycleId})`
        : ""
    }`
  );
  console.log("  Counts:");
  for (const k of Object.keys(manifest.counts).sort()) {
    console.log(`    ${k.padEnd(28)} ${manifest.counts[k]}`);
  }
  const storageBytes = manifest.files
    .filter((f) => f.kind === "storage" && f.storage?.status === "ok")
    .reduce((s, f) => s + f.sizeBytes, 0);
  console.log(
    `  Storage payload: ${formatBytes(storageBytes)} across ${
      manifest.counts.storageFilesOk ?? 0
    } files`
  );
  if (manifest.warnings.length > 0) {
    console.log("  Warnings (from export):");
    for (const w of manifest.warnings) console.log(`    - ${w}`);
  }
}

// -------------------------------------------------------------------- //
// Main
// -------------------------------------------------------------------- //

type Blocker = { code: number; message: string };

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.ALLOW_RESTORE || process.env.ALLOW_RESTORE !== "true") {
    console.error(
      "ALLOW_RESTORE=true must be set in the environment. Refusing."
    );
    process.exit(2);
  }
  if (!args.bundle) {
    console.error("--bundle <path> is required.");
    printHelp();
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing.");
    process.exit(2);
  }

  const bundlePath = path.resolve(args.bundle);
  const bundleBasename = path.basename(bundlePath);
  const dbHost = parseDbHost(process.env.DATABASE_URL);
  const requiresProductionFlag =
    !isLocalHost(dbHost) || process.env.NODE_ENV === "production";
  const now = new Date();
  const phrase = buildConfirmPhrase(bundleBasename, dbHost, now);

  console.log("=".repeat(72));
  console.log(`Restore preview — ${args.execute ? "EXECUTE" : "DRY RUN"}`);
  console.log("=".repeat(72));
  console.log(`Bundle path:      ${bundlePath}`);
  console.log(`Target DB host:   ${dbHost}`);
  console.log(`DB timeout:       ${args.dbTimeoutMs} ms`);
  console.log("");

  // ============ load + verify ============
  let bundle: LoadedBundle;
  try {
    bundle = await loadBundle(bundlePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Refusing: ${msg}`);
    process.exit(3);
  }

  printManifestSummary(bundle.manifest);
  console.log("");

  const blockers: Blocker[] = [];

  // ============ bundle integrity ============
  console.log("Bundle integrity");
  const integrity = await verifyBundleIntegrity(bundle);
  console.log(`  Files checked:    ${integrity.checked}`);
  if (integrity.ok) {
    console.log(`  sha256 status:    OK`);
  } else {
    console.log(`  sha256 status:    FAIL`);
    for (const m of integrity.mismatches.slice(0, 10)) {
      console.log(`    - ${m}`);
    }
    if (integrity.mismatches.length > 10) {
      console.log(`    ... ${integrity.mismatches.length - 10} more`);
    }
    blockers.push({
      code: 10,
      message:
        "Refusing: bundle integrity check failed. Re-export or use a different bundle."
    });
  }
  const missingBlobs = bundle.manifest.files.filter(
    (f) => f.kind === "storage" && f.storage?.status === "missing"
  ).length;
  console.log(`  Missing blobs:    ${missingBlobs}  (will be skipped)`);
  console.log("");

  // ============ schema fingerprint ============
  console.log("Schema fingerprint");
  let currentSchemaHash: string;
  try {
    currentSchemaHash = await readSchemaFingerprint();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Refusing: cannot read prisma/schema.prisma: ${msg}`);
    process.exit(3);
  }
  if (currentSchemaHash === bundle.manifest.schemaFingerprint) {
    console.log(`  Match:            yes`);
  } else {
    console.log(`  Match:            NO`);
    console.log(`    bundle:  ${bundle.manifest.schemaFingerprint}`);
    console.log(`    target:  ${currentSchemaHash}`);
    if (!args.acceptSchemaMismatch) {
      blockers.push({
        code: 11,
        message:
          "Refusing: schema fingerprint differs between bundle and target.\n" +
          "If you have verified the schema change is restore-compatible\n" +
          "(e.g. only added a nullable column), re-run with --accept-schema-mismatch."
      });
    } else {
      console.log(`  Override:         --accept-schema-mismatch is set`);
    }
  }
  console.log("");

  // ============ scope check ============
  console.log("Scope");
  console.log(`  Bundle scope:     ${bundle.manifest.scope.type}`);
  if (
    bundle.manifest.scope.type === "CYCLE" &&
    !args.allowCycleScopeRestore
  ) {
    blockers.push({
      code: 12,
      message:
        "Refusing: bundle scope is CYCLE.\n" +
        "  CYCLE bundles redact User.passwordHash — restoring one will\n" +
        "  produce a database where NO USER can sign in. Every user must\n" +
        "  have their password reset before they can log in again.\n" +
        "  If that is acceptable, re-run with --allow-cycle-scope-restore."
    });
  } else if (
    bundle.manifest.scope.type === "CYCLE" &&
    args.allowCycleScopeRestore
  ) {
    console.log(
      `  Override:         --allow-cycle-scope-restore is set (auth WILL be broken after restore)`
    );
  }
  console.log("");

  // ============ target DB state ============
  console.log("Target DB state");
  const liveCycles = await detectLiveCycles();
  if (liveCycles.length === 0) {
    console.log(`  Live ExamCycles:  0  OK`);
  } else {
    console.log(`  Live ExamCycles:  ${liveCycles.length}  ✗`);
    for (const c of liveCycles.slice(0, 5)) {
      console.log(`    - ${c.id}  ${c.name}`);
    }
    blockers.push({
      code: 13,
      message:
        `Refusing: ${liveCycles.length} ExamCycle(s) currently LIVE in target DB.\n` +
        "End the live event(s) before restoring."
    });
  }
  const dbConflicts = await detectDbIdConflicts(bundle);
  if (dbConflicts.total === 0) {
    console.log(`  Row-id conflicts: 0  OK`);
  } else {
    console.log(`  Row-id conflicts: ${dbConflicts.total}  ✗`);
    for (const s of dbConflicts.samples) console.log(`    - ${s}`);
    blockers.push({
      code: 14,
      message:
        "Refusing: target DB already contains rows whose ids overlap the bundle.\n" +
        "Restore is greenfield-only. Run scripts/reset-qa-data.ts first to clear the\n" +
        "target, then retry."
    });
  }
  console.log("");

  // ============ target storage state ============
  console.log("Target storage state");
  const storageConflicts = await detectStorageConflicts(bundle);
  if (storageConflicts.total === 0) {
    console.log(`  Key conflicts:    0  OK`);
  } else if (args.allowStorageOverwrite) {
    console.log(
      `  Key conflicts:    ${storageConflicts.total}  (overwrite allowed)`
    );
  } else {
    console.log(`  Key conflicts:    ${storageConflicts.total}  ✗`);
    for (const s of storageConflicts.samples) console.log(`    - ${s}`);
    blockers.push({
      code: 15,
      message:
        "Refusing: target storage already contains objects at the bundle's storageKeys.\n" +
        "Either clear the target storage first, or re-run with --allow-storage-overwrite."
    });
  }
  console.log("");

  // ============ production gate ============
  if (requiresProductionFlag && !args.iUnderstandProduction) {
    blockers.push({
      code: 16,
      message:
        `Refusing: DB host (${dbHost}) is not a localhost variant OR NODE_ENV=production.\n` +
        "Add --i-understand-production to acknowledge you intend to restore into a remote DB."
    });
  }

  // ============ confirm phrase (execute only) ============
  if (args.execute && args.confirm !== phrase) {
    blockers.push({
      code: 17,
      message:
        "Refusing: --confirm phrase does not match.\n" +
        `Expected: ${phrase}\n` +
        `Got:      ${args.confirm ?? "(missing)"}`
    });
  }

  // ============ dry-run path ============
  if (!args.execute) {
    if (blockers.length > 0) {
      console.log("DRY RUN — no changes written.");
      console.log(`The following would BLOCK --execute:`);
      for (const b of blockers) console.log("\n" + b.message);
      await prisma.$disconnect();
      process.exit(1);
    }
    console.log("DRY RUN — no changes written.");
    console.log("To execute, run again with:");
    const extraFlags = requiresProductionFlag ? " --i-understand-production" : "";
    console.log(
      `  --bundle "${bundlePath}" --confirm "${phrase}" --execute${extraFlags}`
    );
    await prisma.$disconnect();
    return;
  }

  // ============ execute path ============
  if (blockers.length > 0) {
    console.error("Refusing to --execute because:");
    for (const b of blockers) console.error("\n" + b.message);
    await prisma.$disconnect();
    process.exit(blockers[0].code);
  }

  console.log("EXECUTE — writing to database, then uploading storage.");
  console.log("");

  // Phase B
  console.log("Phase B: DB inserts");
  const dbStart = Date.now();
  let inserted: Record<TableName, number>;
  try {
    inserted = await runDbInserts(bundle, args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`DB transaction failed: ${msg}`);
    console.error("No rows inserted (transaction rolled back).");
    await prisma.$disconnect();
    process.exit(20);
  }
  const dbMs = Date.now() - dbStart;
  for (const table of TABLE_ORDER) {
    console.log(`  ${table.padEnd(32)} ${inserted[table]}`);
  }
  console.log(`  (transaction time: ${(dbMs / 1000).toFixed(1)}s)`);
  console.log("");

  // Phase C
  console.log("Phase C: storage uploads");
  const storageStart = Date.now();
  const storageResult = await runStorageUploads(bundle);
  const storageMs = Date.now() - storageStart;
  console.log(`  uploaded:        ${storageResult.uploaded}`);
  console.log(`  skipped-missing: ${storageResult.skippedMissing}`);
  console.log(`  failed:          ${storageResult.failed}`);
  if (storageResult.failures.length > 0) {
    for (const f of storageResult.failures.slice(0, 10)) {
      console.log(`    - ${f.key}: ${f.reason}`);
    }
    if (storageResult.failures.length > 10) {
      console.log(
        `    ... ${storageResult.failures.length - 10} more failures`
      );
    }
  }
  console.log(`  (upload time: ${(storageMs / 1000).toFixed(1)}s)`);
  console.log("");

  console.log("Done.");
  if (storageResult.failed > 0) {
    console.log(
      "NOTE: storage uploads failed for some blobs. Database rows that\n" +
        "reference those blobs are now dangling. Inspect the failures and\n" +
        "re-upload those keys manually if needed."
    );
  }
  console.log(
    "Reminder: AppSession was not exported, so all users must sign in again."
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
