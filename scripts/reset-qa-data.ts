/**
 * Phase F.5 — QA reset script.
 *
 * DESTRUCTIVE. Wipes operational data (auth sessions, drafts, session
 * messages and attachments, sessions, exam cycles, audit logs, signup
 * requests, and non-preserved users) to prepare the app for a real
 * event after QA. Authored scenario content (Scenario / ScenarioRole /
 * ScenarioTemplate / ScenarioFile / ScenarioTemplateAttachment) and
 * their storage files are PRESERVED by default — use --wipe-scenarios
 * to remove them too.
 *
 * This script will refuse to run unless ALL of the following are true:
 *   - ALLOW_QA_RESET=true is set in the environment
 *   - DATABASE_URL is set
 *   - No ExamCycle currently has status=LIVE
 *   - --confirm "<phrase>" matches the phrase printed in the dry-run
 *   - If the DB host is not a localhost variant OR NODE_ENV=production,
 *     --i-understand-production is passed
 *   - --execute is passed (otherwise the script runs in dry-run mode)
 *
 * Preserved users default to:
 *   1. Any user whose normalized fullName matches normalize(BOOTSTRAP_ADMIN_NAME),
 *      if that env var is set
 *   2. Otherwise, normalize("Einan Farhi")
 * plus any --preserve-user-id / --preserve-name / --keep-approved-staff
 * additions. Use --no-default-preserve to skip rule 1/2 and use only the
 * explicit flags, or --allow-empty-preserve to wipe ALL users (refuses
 * by default if the resolved set is empty).
 *
 * Storage cleanup runs AFTER the DB transaction commits, best-effort,
 * tolerating missing files (NoSuchKey / ENOENT).
 *
 * This file lives under scripts/ and is never imported from app code.
 * It is not referenced by `npm start`, `prisma db seed`, or any other
 * automatic path.
 */

import { ExamCycleStatus, PrismaClient, UserRole } from "@prisma/client";

import { deleteFile } from "../src/lib/storage";
import { normalizeNameKey } from "../src/lib/utils";

const prisma = new PrismaClient();

type Args = {
  execute: boolean;
  confirm: string | null;
  iUnderstandProduction: boolean;
  wipeScenarios: boolean;
  keepApprovedStaff: boolean;
  noDefaultPreserve: boolean;
  allowEmptyPreserve: boolean;
  preserveUserIds: string[];
  preserveNames: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    execute: false,
    confirm: null,
    iUnderstandProduction: false,
    wipeScenarios: false,
    keepApprovedStaff: false,
    noDefaultPreserve: false,
    allowEmptyPreserve: false,
    preserveUserIds: [],
    preserveNames: []
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    switch (token) {
      case "--execute":
        args.execute = true;
        break;
      case "--i-understand-production":
        args.iUnderstandProduction = true;
        break;
      case "--wipe-scenarios":
        args.wipeScenarios = true;
        break;
      case "--keep-approved-staff":
        args.keepApprovedStaff = true;
        break;
      case "--no-default-preserve":
        args.noDefaultPreserve = true;
        break;
      case "--allow-empty-preserve":
        args.allowEmptyPreserve = true;
        break;
      case "--confirm": {
        const phrase = argv[++i];
        if (!phrase) {
          console.error("--confirm requires a phrase argument.");
          process.exit(2);
        }
        args.confirm = phrase;
        break;
      }
      case "--preserve-user-id": {
        const id = argv[++i];
        if (!id) {
          console.error("--preserve-user-id requires an id argument.");
          process.exit(2);
        }
        args.preserveUserIds.push(id);
        break;
      }
      case "--preserve-name": {
        const name = argv[++i];
        if (!name) {
          console.error("--preserve-name requires a name argument.");
          process.exit(2);
        }
        args.preserveNames.push(name);
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
  console.log(`QA reset script — wipes operational data.

Usage:
  ALLOW_QA_RESET=true npx tsx scripts/reset-qa-data.ts [flags]

Common flows:
  Dry-run (always safe):
    ALLOW_QA_RESET=true npx tsx scripts/reset-qa-data.ts

  Execute locally (ops data only, keeps scenarios):
    ALLOW_QA_RESET=true npx tsx scripts/reset-qa-data.ts \\
      --confirm "RESET QA DATA FOR localhost AT YYYY-MM-DDTHH:MMZ" --execute

  Execute and also wipe scenarios:
    ... --execute --wipe-scenarios

  Against a non-local DB:
    ... --execute --i-understand-production

Preservation flags:
  --preserve-user-id <id>     keep this user (repeatable)
  --preserve-name "<name>"    keep users whose normalized name matches (repeatable)
  --keep-approved-staff       keep all approved PSYCHOLOGIST users
  --no-default-preserve       do not auto-preserve BOOTSTRAP_ADMIN_NAME / "Einan Farhi"
  --allow-empty-preserve      allow the preserve set to be empty (wipes ALL users)

Other:
  --wipe-scenarios            also remove Scenario/Role/Template/File rows
  --execute                   actually delete (otherwise dry-run)
  --i-understand-production   required if DB host is not localhost
  --confirm "<phrase>"        required for --execute; phrase is printed in dry-run
`);
}

function parseDbHost(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return url.hostname || "<unknown>";
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

function buildConfirmPhrase(host: string, now: Date): string {
  // Truncate to minute precision: YYYY-MM-DDTHH:MM
  const iso = now.toISOString().slice(0, 16) + "Z";
  return `RESET QA DATA FOR ${host} AT ${iso}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type PreservedUser = {
  id: string;
  fullName: string;
  role: UserRole;
  isApproved: boolean;
};

async function resolvePreserveSet(args: Args): Promise<PreservedUser[]> {
  const explicitIds = new Set<string>(args.preserveUserIds);
  const explicitNames = new Set<string>(args.preserveNames.map((n) => normalizeNameKey(n)));

  const defaultNames = new Set<string>();
  if (!args.noDefaultPreserve) {
    const envName = process.env.BOOTSTRAP_ADMIN_NAME;
    if (envName && envName.trim().length > 0) {
      defaultNames.add(normalizeNameKey(envName));
    } else {
      defaultNames.add(normalizeNameKey("Einan Farhi"));
    }
  }

  const allUsers = await prisma.user.findMany({
    select: { id: true, fullName: true, role: true, isApproved: true }
  });

  const matched = new Map<string, PreservedUser>();
  for (const user of allUsers) {
    const normalized = normalizeNameKey(user.fullName);
    if (explicitIds.has(user.id)) {
      matched.set(user.id, user);
      continue;
    }
    if (explicitNames.has(normalized) || defaultNames.has(normalized)) {
      matched.set(user.id, user);
      continue;
    }
    if (args.keepApprovedStaff && user.role === UserRole.PSYCHOLOGIST && user.isApproved) {
      matched.set(user.id, user);
      continue;
    }
  }

  return Array.from(matched.values());
}

type Counts = Record<string, number>;

async function getCounts(): Promise<Counts> {
  const [
    appSession,
    auditLog,
    draft,
    sessionAttachment,
    sessionMessage,
    session,
    examCycleStudent,
    examCycle,
    scenarioTemplateAttachment,
    scenarioTemplate,
    scenarioRole,
    scenarioFile,
    scenario,
    staffSignupRequest,
    user
  ] = await Promise.all([
    prisma.appSession.count(),
    prisma.auditLog.count(),
    prisma.draft.count(),
    prisma.sessionAttachment.count(),
    prisma.sessionMessage.count(),
    prisma.session.count(),
    prisma.examCycleStudent.count(),
    prisma.examCycle.count(),
    prisma.scenarioTemplateAttachment.count(),
    prisma.scenarioTemplate.count(),
    prisma.scenarioRole.count(),
    prisma.scenarioFile.count(),
    prisma.scenario.count(),
    prisma.staffSignupRequest.count(),
    prisma.user.count()
  ]);
  return {
    AppSession: appSession,
    AuditLog: auditLog,
    Draft: draft,
    SessionAttachment: sessionAttachment,
    SessionMessage: sessionMessage,
    Session: session,
    ExamCycleStudent: examCycleStudent,
    ExamCycle: examCycle,
    ScenarioTemplateAttachment: scenarioTemplateAttachment,
    ScenarioTemplate: scenarioTemplate,
    ScenarioRole: scenarioRole,
    ScenarioFile: scenarioFile,
    Scenario: scenario,
    StaffSignupRequest: staffSignupRequest,
    User: user
  };
}

function printCounts(label: string, counts: Counts) {
  console.log(`\n${label}:`);
  const pad = 32;
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(pad)} ${v}`);
  }
}

type StorageEntry = { storageKey: string; sizeBytes: number; source: string };

async function gatherStorageKeys(wipeScenarios: boolean): Promise<StorageEntry[]> {
  const out: StorageEntry[] = [];

  const sessionAttachments = await prisma.sessionAttachment.findMany({
    select: { storageKey: true, sizeBytes: true }
  });

  // When scenarios are preserved, the ScenarioTemplateAttachment rows
  // survive. Preloaded template propagation (psychologist.ts) creates
  // SessionAttachment rows that REUSE the originating template
  // attachment's storageKey rather than copying the blob — so deleting
  // every SessionAttachment storageKey would unlink blobs still
  // referenced by surviving ScenarioTemplateAttachment rows. Exclude
  // any key that's still referenced.
  const keptTemplateAttachmentKeys = wipeScenarios
    ? new Set<string>()
    : new Set(
        (
          await prisma.scenarioTemplateAttachment.findMany({
            select: { storageKey: true }
          })
        ).map((a) => a.storageKey)
      );

  for (const f of sessionAttachments) {
    if (keptTemplateAttachmentKeys.has(f.storageKey)) continue;
    out.push({ storageKey: f.storageKey, sizeBytes: f.sizeBytes, source: "SessionAttachment" });
  }

  if (wipeScenarios) {
    const scenarioFiles = await prisma.scenarioFile.findMany({
      where: { storageKey: { not: null } },
      select: { storageKey: true, sizeBytes: true }
    });
    for (const f of scenarioFiles) {
      if (f.storageKey) {
        out.push({ storageKey: f.storageKey, sizeBytes: f.sizeBytes ?? 0, source: "ScenarioFile" });
      }
    }

    const templateAttachments = await prisma.scenarioTemplateAttachment.findMany({
      select: { storageKey: true, sizeBytes: true }
    });
    for (const f of templateAttachments) {
      out.push({ storageKey: f.storageKey, sizeBytes: f.sizeBytes, source: "ScenarioTemplateAttachment" });
    }
  }

  return out;
}

type ScenarioConflict = {
  scenarioId: string;
  name: string;
  createdById: string;
  createdByName: string;
};

async function findScenarioCreatorConflicts(preservedIds: Set<string>): Promise<ScenarioConflict[]> {
  const scenarios = await prisma.scenario.findMany({
    select: {
      id: true,
      name: true,
      createdById: true,
      createdBy: { select: { fullName: true } }
    }
  });
  return scenarios
    .filter((s) => !preservedIds.has(s.createdById))
    .map((s) => ({
      scenarioId: s.id,
      name: s.name,
      createdById: s.createdById,
      createdByName: s.createdBy.fullName
    }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // ============ env gates ============
  if (process.env.ALLOW_QA_RESET !== "true") {
    console.error('Refusing: ALLOW_QA_RESET environment variable is not set to "true".');
    console.error("Set it for THIS shell only, e.g.:");
    console.error("  ALLOW_QA_RESET=true npx tsx scripts/reset-qa-data.ts");
    process.exit(3);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Refusing: DATABASE_URL is not set.");
    process.exit(3);
  }

  const host = parseDbHost(dbUrl);
  const isLocal = isLocalHost(host);
  const isProd = process.env.NODE_ENV === "production";
  const requiresProductionFlag = !isLocal || isProd;

  const now = new Date();
  const phrase = buildConfirmPhrase(host, now);

  console.log("== QA RESET ==");
  console.log(`Database host:        ${host}${isLocal ? "  (LOCAL)" : "  (REMOTE)"}`);
  console.log(`Storage mode:         ${process.env.STORAGE_MODE === "s3" ? "s3" : "local"}`);
  console.log(`NODE_ENV:             ${process.env.NODE_ENV ?? "(unset)"}`);
  console.log(`Mode:                 ${args.execute ? "EXECUTE" : "DRY RUN"}`);

  // ============ collect blockers (printed always; only enforced for --execute) ============
  const blockers: { code: number; message: string }[] = [];

  const liveCycles = await prisma.examCycle.findMany({
    where: { status: ExamCycleStatus.LIVE },
    select: { id: true, name: true }
  });
  if (liveCycles.length > 0) {
    let msg = `Refusing: ${liveCycles.length} exam cycle(s) are currently LIVE:\n`;
    for (const c of liveCycles) {
      msg += `  - ${c.id}  ${c.name}\n`;
    }
    msg += "End the live event(s) before executing QA reset.";
    blockers.push({ code: 4, message: msg });
    console.log(`Live cycles:          ${liveCycles.length}  ✗ (would block --execute)`);
  } else {
    console.log(`Live cycles:          0  OK`);
  }

  if (requiresProductionFlag && !args.iUnderstandProduction) {
    blockers.push({
      code: 5,
      message:
        `Refusing: DB host (${host}) is not a localhost variant OR NODE_ENV=production.\n` +
        "Add --i-understand-production to acknowledge you intend to wipe a remote/production DB."
    });
  }

  // ============ preserve set ============
  const preserveSet = await resolvePreserveSet(args);
  const preserveIds = new Set(preserveSet.map((u) => u.id));

  console.log(`\nUsers to preserve (${preserveSet.length}):`);
  if (preserveSet.length === 0) {
    console.log("  (none)");
  } else {
    for (const u of preserveSet) {
      console.log(
        `  ${u.id}  ${u.fullName.padEnd(28)} ${u.role.padEnd(13)} ${u.isApproved ? "approved" : "pending"}`
      );
    }
  }

  if (preserveSet.length === 0 && !args.allowEmptyPreserve) {
    blockers.push({
      code: 6,
      message:
        "Refusing: preserve set is empty — this would delete every user.\n" +
        "Either:\n" +
        "  - set BOOTSTRAP_ADMIN_NAME in env to your admin's exact name, or\n" +
        "  - pass --preserve-user-id <id> at least once, or\n" +
        '  - pass --preserve-name "<name>" at least once, or\n' +
        "  - pass --allow-empty-preserve to truly wipe ALL users."
    });
  }

  // ============ scenario creator conflict (when keeping scenarios) ============
  if (!args.wipeScenarios) {
    const conflicts = await findScenarioCreatorConflicts(preserveIds);
    if (conflicts.length > 0) {
      let msg =
        "Refusing: the following scenarios are being kept but their createdBy user is not preserved.\n" +
        "Scenario.createdById uses onDelete: Restrict — deleting these users would fail mid-transaction.\n";
      for (const c of conflicts) {
        msg += `  - Scenario "${c.name}" (${c.scenarioId}) created by ${c.createdByName} (${c.createdById})\n`;
      }
      msg += "Either add --preserve-user-id for each creator, or pass --wipe-scenarios.";
      blockers.push({ code: 7, message: msg });
    }
  }

  // ============ counts + storage gathering ============
  const preCounts = await getCounts();
  printCounts("Pre-reset counts", preCounts);

  const storageKeys = await gatherStorageKeys(args.wipeScenarios);
  const totalBytes = storageKeys.reduce((s, k) => s + k.sizeBytes, 0);
  console.log(`\nStorage files to delete: ${storageKeys.length}  (${formatBytes(totalBytes)})`);

  // ============ confirm phrase (execute only) ============
  if (args.execute && args.confirm !== phrase) {
    blockers.push({
      code: 8,
      message:
        "Refusing: --confirm phrase does not match.\n" +
        `Expected: ${phrase}\n` +
        `Got:      ${args.confirm ?? "(missing)"}`
    });
  }

  // ============ dry-run path ============
  if (!args.execute) {
    if (blockers.length > 0) {
      console.log(`\nDRY RUN — no changes written. The following would BLOCK --execute:`);
      for (const b of blockers) {
        console.log("\n" + b.message);
      }
    } else {
      console.log("\nDRY RUN — no changes written.");
      console.log("To execute, run again with:");
      const extraFlags = requiresProductionFlag ? " --i-understand-production" : "";
      console.log(`  --confirm "${phrase}" --execute${extraFlags}`);
    }
    await prisma.$disconnect();
    return;
  }

  // ============ execute path: enforce blockers ============
  if (blockers.length > 0) {
    console.error("\n== EXECUTE REFUSED ==");
    for (const b of blockers) {
      console.error("\n" + b.message);
    }
    await prisma.$disconnect();
    process.exit(blockers[0].code);
  }

  // ============ EXECUTE ============
  console.log("\n== EXECUTING TRANSACTION ==");

  const ops: ReturnType<typeof prisma.appSession.deleteMany>[] = [];
  const labels: string[] = [];

  const push = <T>(op: T, label: string) => {
    // The Prisma client's deleteMany returns a PrismaPromise; we collect them
    // for a single $transaction(...) call. All ops share the same return shape
    // ({ count: number }), so the parallel arrays approach works cleanly.
    ops.push(op as unknown as ReturnType<typeof prisma.appSession.deleteMany>);
    labels.push(label);
  };

  push(prisma.appSession.deleteMany({}), "AppSession");
  push(prisma.auditLog.deleteMany({}), "AuditLog");
  push(prisma.draft.deleteMany({}), "Draft");
  push(prisma.sessionAttachment.deleteMany({}), "SessionAttachment");
  push(prisma.sessionMessage.deleteMany({}), "SessionMessage");
  push(prisma.session.deleteMany({}), "Session");
  push(prisma.examCycleStudent.deleteMany({}), "ExamCycleStudent");
  push(prisma.examCycle.deleteMany({}), "ExamCycle");

  if (args.wipeScenarios) {
    push(prisma.scenarioTemplateAttachment.deleteMany({}), "ScenarioTemplateAttachment");
    push(prisma.scenarioTemplate.deleteMany({}), "ScenarioTemplate");
    push(prisma.scenarioRole.deleteMany({}), "ScenarioRole");
    push(prisma.scenarioFile.deleteMany({}), "ScenarioFile");
    push(prisma.scenario.deleteMany({}), "Scenario");
  }

  push(prisma.staffSignupRequest.deleteMany({}), "StaffSignupRequest");
  push(
    prisma.user.deleteMany({ where: { id: { notIn: Array.from(preserveIds) } } }),
    "User (non-preserved)"
  );

  const result = await prisma.$transaction(ops);
  console.log("Transaction committed. Deleted per stage:");
  result.forEach((r, i) => {
    console.log(`  ${labels[i].padEnd(30)} ${r.count}`);
  });

  // ============ storage cleanup ============
  console.log("\n== STORAGE CLEANUP ==");
  let okCount = 0;
  let failCount = 0;
  for (const entry of storageKeys) {
    try {
      await deleteFile(entry.storageKey);
      okCount++;
    } catch (e) {
      failCount++;
      console.error(`  ! failed to delete ${entry.storageKey} (${entry.source}):`, e);
    }
  }
  console.log(`Storage files deleted: ${okCount}  (failures: ${failCount})`);

  // ============ post-counts ============
  const postCounts = await getCounts();
  printCounts("Post-reset counts", postCounts);

  console.log("\n== QA RESET COMPLETE ==");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nQA RESET FAILED");
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
