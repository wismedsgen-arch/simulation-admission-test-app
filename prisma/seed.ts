import {
  ActorType,
  CycleStudentStatus,
  ExamCycleStatus,
  ScenarioFileKind,
  SessionStatus,
  TemplateKind,
  TextDirection,
  UserRole
} from "@prisma/client";

import { hashPassword } from "../src/lib/auth/crypto";
import { prisma } from "../src/lib/db/prisma";
import scenarioData from "./scenario-ron-lab.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

function skip(msg: string) {
  console.log(`[seed] SKIP  ${msg}`);
}

function created(msg: string) {
  console.log(`[seed] NEW   ${msg}`);
}

// ---------------------------------------------------------------------------
// Admin bootstrap
// ---------------------------------------------------------------------------

async function seedAdmin(): Promise<string | null> {
  const name = process.env.BOOTSTRAP_ADMIN_NAME;
  const governmentId = process.env.BOOTSTRAP_ADMIN_ID;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  // If bootstrap env vars are not set, do nothing (original behaviour).
  if (!name || !governmentId || !password) {
    skip("Admin — BOOTSTRAP_ADMIN_* env vars not set, skipping admin and scenario seed.");
    return null;
  }

  const existing = await prisma.user.findUnique({ where: { governmentId } });

  if (existing) {
    skip(`Admin — "${existing.fullName}" already exists (${existing.id})`);
    return existing.id;
  }

  const admin = await prisma.user.create({
    data: {
      fullName: name,
      governmentId,
      passwordHash: await hashPassword(password),
      role: UserRole.ADMIN,
      isApproved: true
    }
  });

  created(`Admin — "${admin.fullName}" (${admin.id})`);
  return admin.id;
}

// ---------------------------------------------------------------------------
// Scenario seed
// ---------------------------------------------------------------------------

async function seedScenario(createdById: string): Promise<string> {
  const existing = await prisma.scenario.findFirst({
    where: { name: scenarioData.scenario.name }
  });

  if (existing) {
    skip(`Scenario — "${scenarioData.scenario.name}" already exists (${existing.id})`);
    return existing.id;
  }

  // ------------------------------------------------------------------
  // 1. Scenario
  // ------------------------------------------------------------------
  const scenario = await prisma.scenario.create({
    data: {
      name: scenarioData.scenario.name,
      description: scenarioData.scenario.description,
      openingTitle: scenarioData.scenario.openingTitle,
      openingInstructions: scenarioData.scenario.openingInstructions,
      openingInstructionsDirection: scenarioData.scenario.openingInstructionsDirection as TextDirection,
      psychologistInstructions: scenarioData.scenario.psychologistInstructions,
      psychologistInstructionsDirection: scenarioData.scenario.psychologistInstructionsDirection as TextDirection,
      durationMinutes: scenarioData.scenario.durationMinutes,
      createdById
    }
  });

  created(`Scenario — "${scenario.name}" (${scenario.id})`);

  // ------------------------------------------------------------------
  // 2. Roles — build key → Prisma ID map for template references
  // ------------------------------------------------------------------
  const roleKeyMap: Record<string, string> = {};

  for (const roleData of scenarioData.roles) {
    const role = await prisma.scenarioRole.create({
      data: {
        scenarioId: scenario.id,
        name: roleData.name,
        category: roleData.category,
        description: roleData.description || null,
        descriptionDirection: roleData.descriptionDirection as TextDirection,
        accentColor: roleData.accentColor,
        emailAddress: roleData.emailAddress
      }
    });

    roleKeyMap[roleData.key] = role.id;
    created(`  Role [${roleData.key}] — ${roleData.name}`);
  }

  // ------------------------------------------------------------------
  // 3. Email templates (PRELOADED and FOLLOW_UP)
  // ------------------------------------------------------------------
  const preloaded = scenarioData.templates.filter((t) => t.kind === "PRELOADED");
  const followUp = scenarioData.templates.filter((t) => t.kind === "FOLLOW_UP");

  for (const templateData of scenarioData.templates) {
    const roleId = roleKeyMap[templateData.roleKey];

    if (!roleId) {
      throw new Error(
        `Unknown roleKey "${templateData.roleKey}" in template "${templateData.subject}". ` +
          `Available keys: ${Object.keys(roleKeyMap).join(", ")}`
      );
    }

    await prisma.scenarioTemplate.create({
      data: {
        scenarioId: scenario.id,
        roleId,
        kind: templateData.kind as TemplateKind,
        sendOrder: templateData.sendOrder ?? null,
        subject: templateData.subject,
        body: templateData.body,
        bodyDirection: templateData.bodyDirection as TextDirection,
        isEnabled: true
      }
    });
  }

  created(
    `  Templates — ${preloaded.length} PRELOADED (ordered 1-${preloaded.length}), ` +
      `${followUp.length} FOLLOW_UP`
  );

  // ------------------------------------------------------------------
  // 4. Scenario files (drive documents)
  // ------------------------------------------------------------------
  for (const fileData of scenarioData.files) {
    await prisma.scenarioFile.create({
      data: {
        scenarioId: scenario.id,
        name: fileData.name,
        kind: "TEXT" as ScenarioFileKind,
        textContent: fileData.textContent,
        textDirection: fileData.textDirection as TextDirection,
        storageKey: null,
        fileName: null,
        mimeType: null,
        sizeBytes: null
      }
    });

    created(`  File — "${fileData.name}"`);
  }

  return scenario.id;
}

// ---------------------------------------------------------------------------
// Demo: psychologist user
// ---------------------------------------------------------------------------

const PSYCH_GOV_ID = "DEMO-PSYCH-001";

async function seedPsychologist(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { governmentId: PSYCH_GOV_ID } });

  if (existing) {
    skip(`Psychologist — "${existing.fullName}" already exists`);
    return existing.id;
  }

  const psych = await prisma.user.create({
    data: {
      fullName: 'ד"ר מיכל ברקוביץ',
      governmentId: PSYCH_GOV_ID,
      passwordHash: await hashPassword("demo1234"),
      role: UserRole.PSYCHOLOGIST,
      isApproved: true
    }
  });

  created(`Psychologist — "${psych.fullName}" (${psych.id})`);
  return psych.id;
}

// ---------------------------------------------------------------------------
// Demo: exam cycle
// ---------------------------------------------------------------------------

const CYCLE_NAME = "מחזור הדגמה - אביב 2025";

async function seedExamCycle(scenarioId: string, createdById: string): Promise<string> {
  const existing = await prisma.examCycle.findFirst({ where: { name: CYCLE_NAME, scenarioId } });

  if (existing) {
    skip(`ExamCycle — "${CYCLE_NAME}" already exists`);
    return existing.id;
  }

  const cycle = await prisma.examCycle.create({
    data: {
      name: CYCLE_NAME,
      institution: "מכון ויצמן למדע",
      scenarioId,
      accessCode: "1234",
      status: ExamCycleStatus.LIVE,
      createdById
    }
  });

  created(`ExamCycle — "${cycle.name}" (${cycle.id})`);
  return cycle.id;
}

// ---------------------------------------------------------------------------
// Demo: waiting students
// ---------------------------------------------------------------------------

async function seedWaitingStudents(cycleId: string): Promise<void> {
  const students = [
    { fullName: "אמיר כהן", governmentId: "DEMO-WAIT-001" },
    { fullName: "ליאת שפירו", governmentId: "DEMO-WAIT-002" },
    { fullName: "נועם לוי", governmentId: "DEMO-WAIT-003" }
  ];

  for (const s of students) {
    const existing = await prisma.examCycleStudent.findUnique({
      where: { examCycleId_governmentId: { examCycleId: cycleId, governmentId: s.governmentId } }
    });

    if (existing) {
      skip(`Student (WAITING) — "${s.fullName}" already in cycle`);
      continue;
    }

    await prisma.examCycleStudent.create({
      data: {
        examCycleId: cycleId,
        fullName: s.fullName,
        governmentId: s.governmentId,
        accessCode: "1234",
        status: CycleStudentStatus.WAITING
      }
    });

    created(`  Student (WAITING) — "${s.fullName}"`);
  }
}

// ---------------------------------------------------------------------------
// Demo: active session
// ---------------------------------------------------------------------------

async function seedActiveSession(
  cycleId: string,
  scenarioId: string,
  psychologistId: string,
  adminId: string
): Promise<void> {
  const STUDENT_GOV_ID = "DEMO-ACTIVE-001";
  const STUDENT_NAME = "יעקב לוי";

  const existingStudent = await prisma.examCycleStudent.findUnique({
    where: { examCycleId_governmentId: { examCycleId: cycleId, governmentId: STUDENT_GOV_ID } }
  });

  if (existingStudent) {
    skip(`Active session student — "${STUDENT_NAME}" already in cycle`);
    return;
  }

  const templates = await prisma.scenarioTemplate.findMany({
    where: { scenarioId, kind: TemplateKind.PRELOADED, isEnabled: true },
    include: { role: true },
    orderBy: { sendOrder: "asc" }
  });

  const now = new Date();
  const startedAt = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
  const endsAt = new Date(startedAt.getTime() + 90 * 60 * 1000); // ends in 60 min
  const claimedAt = new Date(startedAt.getTime() - 10 * 60 * 1000);
  const readyAt = new Date(startedAt.getTime() - 3 * 60 * 1000);

  const student = await prisma.examCycleStudent.create({
    data: {
      examCycleId: cycleId,
      fullName: STUDENT_NAME,
      governmentId: STUDENT_GOV_ID,
      accessCode: "1234",
      status: CycleStudentStatus.ACTIVE,
      claimedById: psychologistId,
      claimedAt,
      readyAt,
      activatedAt: startedAt
    }
  });

  const session = await prisma.session.create({
    data: {
      examCycleId: cycleId,
      cycleStudentId: student.id,
      scenarioId,
      assignedPsychologistId: psychologistId,
      startedById: adminId,
      status: SessionStatus.ACTIVE,
      introAcknowledgedAt: startedAt,
      startedAt,
      endsAt
    }
  });

  // Preloaded messages sent 1 minute apart from session start
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    await prisma.sessionMessage.create({
      data: {
        sessionId: session.id,
        templateId: t.id,
        senderType: ActorType.STAFF,
        senderStaffId: psychologistId,
        senderRoleId: t.roleId,
        senderDisplayName: t.role.name,
        recipientName: STUDENT_NAME,
        subject: t.subject,
        body: t.body,
        bodyDirection: t.bodyDirection,
        sentAt: new Date(startedAt.getTime() + i * 60 * 1000)
      }
    });
  }

  // One student reply to the first message (from ד"ר שרה לוי)
  const firstMsg = await prisma.sessionMessage.findFirst({
    where: { sessionId: session.id },
    orderBy: { sentAt: "asc" }
  });

  if (firstMsg) {
    await prisma.sessionMessage.create({
      data: {
        sessionId: session.id,
        senderType: ActorType.STUDENT,
        senderDisplayName: STUDENT_NAME,
        recipientName: 'ד"ר שרה לוי',
        subject: `Re: ${firstMsg.subject}`,
        body: 'שלום ד"ר לוי,\n\nתודה על ההתראה. אשלח את השקף עד השעה 9:30. לגבי פגישת תכנון – מה דעתך ביום רביעי ב-14:00?\n\nבברכה,\nאורי',
        bodyDirection: TextDirection.RTL,
        replyToId: firstMsg.id,
        sentAt: new Date(startedAt.getTime() + 18 * 60 * 1000)
      }
    });
  }

  created(
    `  Active session — "${STUDENT_NAME}" (${session.id}), ${templates.length} preloaded + 1 reply`
  );
}

// ---------------------------------------------------------------------------
// Demo: completed session
// ---------------------------------------------------------------------------

async function seedCompletedSession(
  cycleId: string,
  scenarioId: string,
  psychologistId: string,
  adminId: string
): Promise<void> {
  const STUDENT_GOV_ID = "DEMO-COMPLETED-001";
  const STUDENT_NAME = "מיכל ברגמן";

  const existingStudent = await prisma.examCycleStudent.findUnique({
    where: { examCycleId_governmentId: { examCycleId: cycleId, governmentId: STUDENT_GOV_ID } }
  });

  if (existingStudent) {
    skip(`Completed session student — "${STUDENT_NAME}" already in cycle`);
    return;
  }

  const templates = await prisma.scenarioTemplate.findMany({
    where: { scenarioId, kind: TemplateKind.PRELOADED, isEnabled: true },
    include: { role: true },
    orderBy: { sendOrder: "asc" }
  });

  const followUpTemplates = await prisma.scenarioTemplate.findMany({
    where: { scenarioId, kind: TemplateKind.FOLLOW_UP, isEnabled: true },
    include: { role: true },
    orderBy: { createdAt: "asc" }
  });

  // Session took place yesterday
  const startedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const endsAt = new Date(startedAt.getTime() + 90 * 60 * 1000);
  const endedAt = new Date(startedAt.getTime() + 88 * 60 * 1000);
  const claimedAt = new Date(startedAt.getTime() - 12 * 60 * 1000);
  const readyAt = new Date(startedAt.getTime() - 4 * 60 * 1000);

  const student = await prisma.examCycleStudent.create({
    data: {
      examCycleId: cycleId,
      fullName: STUDENT_NAME,
      governmentId: STUDENT_GOV_ID,
      accessCode: "5678",
      status: CycleStudentStatus.COMPLETED,
      claimedById: psychologistId,
      claimedAt,
      readyAt,
      activatedAt: startedAt,
      completedAt: endedAt
    }
  });

  const session = await prisma.session.create({
    data: {
      examCycleId: cycleId,
      cycleStudentId: student.id,
      scenarioId,
      assignedPsychologistId: psychologistId,
      startedById: adminId,
      status: SessionStatus.COMPLETED,
      introAcknowledgedAt: startedAt,
      startedAt,
      endsAt,
      endedAt
    }
  });

  // All preloaded messages, sent every 5 minutes
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    await prisma.sessionMessage.create({
      data: {
        sessionId: session.id,
        templateId: t.id,
        senderType: ActorType.STAFF,
        senderStaffId: psychologistId,
        senderRoleId: t.roleId,
        senderDisplayName: t.role.name,
        recipientName: STUDENT_NAME,
        subject: t.subject,
        body: t.body,
        bodyDirection: t.bodyDirection,
        sentAt: new Date(startedAt.getTime() + i * 5 * 60 * 1000)
      }
    });
  }

  // Fetch seeded messages in order so we can reply to them by index
  const seededMessages = await prisma.sessionMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { sentAt: "asc" }
  });

  // Student replies to several emails throughout the session
  const replies: Array<{ toIndex: number; recipientName: string; body: string; delayMin: number }> =
    [
      {
        toIndex: 0, // ד"ר שרה לוי – ישיבת צוות
        recipientName: 'ד"ר שרה לוי',
        body: 'שלום ד"ר לוי,\n\nתודה על ההתראה. אשלח את השקף לפני הפגישה. לגבי פגישת תכנון – מה דעתך ביום שלישי ב-15:00?\n\nבברכה,\nאורי',
        delayMin: 7
      },
      {
        toIndex: 2, // רועי שפירא – RNA-seq
        recipientName: "רועי שפירא",
        body: "רועי שלום,\n\nלפי מה שראיתי בכנס, הייתי הולך על הגרסה שמציגה את ההבדל בביטוי בין האזורים – זה הממצא המעניין. הייתי מוסיף הסתייגות ברורה בגוף הפוסטר. הכרעה שלי עד 12:00.\n\nאורי",
        delayMin: 22
      },
      {
        toIndex: 3, // ד"ר דוד אבן – עכברים
        recipientName: 'ד"ר דוד אבן',
        body: "דוד שלום,\n\nאני מעדיף להמתין 3-4 שבועות לאספקה מלאה מהמחזור הנכון. אמינות הנתונים חשובה לי יותר ממהירות ההתחלה.\n\nאורי",
        delayMin: 38
      },
      {
        toIndex: 5, // ד"ר שרה לוי – שיעור אחר
        recipientName: 'ד"ר שרה לוי',
        body: "שרה שלום,\n\nאני מוכן להצטרף לשתי השעות הראשונות בבוקר, עד ישיבת הצוות. אנא עדכני אותי באיזה חדר.\n\nאורי",
        delayMin: 52
      },
      {
        toIndex: 6, // פרופ' מרקוס וייס – דגימות
        recipientName: "פרופ' מרקוס וייס",
        body: "פרופ' וייס שלום,\n\nתודה על העדכון. אעביר את הבקשה לדוח הבטיחות לד\"ר שרה לוי שמטפלת בנושא מול פרופ' רון. נעדכן אתכם ברגע שיש לנו תאריך.\n\nבברכה,\nאורי כהן",
        delayMin: 65
      }
    ];

  for (const r of replies) {
    const parentMsg = seededMessages[r.toIndex];
    if (!parentMsg) continue;
    await prisma.sessionMessage.create({
      data: {
        sessionId: session.id,
        senderType: ActorType.STUDENT,
        senderDisplayName: STUDENT_NAME,
        recipientName: r.recipientName,
        subject: `Re: ${parentMsg.subject}`,
        body: r.body,
        bodyDirection: TextDirection.RTL,
        replyToId: parentMsg.id,
        sentAt: new Date(startedAt.getTime() + r.delayMin * 60 * 1000)
      }
    });
  }

  // One follow-up (בלת"מ) sent by psychologist mid-session
  // Use index 1 = "בלת"מ 2 - חידוש ביטוח דחוף" (danny_insurance), sent at 40 min
  const followUpTemplate = followUpTemplates[1] ?? followUpTemplates[0];
  if (followUpTemplate) {
    await prisma.sessionMessage.create({
      data: {
        sessionId: session.id,
        templateId: followUpTemplate.id,
        senderType: ActorType.STAFF,
        senderStaffId: psychologistId,
        senderRoleId: followUpTemplate.roleId,
        senderDisplayName: followUpTemplate.role.name,
        recipientName: STUDENT_NAME,
        subject: followUpTemplate.subject,
        body: followUpTemplate.body,
        bodyDirection: followUpTemplate.bodyDirection,
        sentAt: new Date(startedAt.getTime() + 40 * 60 * 1000)
      }
    });
  }

  const totalMessages = templates.length + replies.length + (followUpTemplate ? 1 : 0);
  created(
    `  Completed session — "${STUDENT_NAME}" (${session.id}), ${totalMessages} messages total`
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  log("Starting seed...");

  const adminId = await seedAdmin();

  if (!adminId) {
    log("Seed complete (no admin — scenario skipped).");
    return;
  }

  const scenarioId = await seedScenario(adminId);
  const psychologistId = await seedPsychologist();
  const cycleId = await seedExamCycle(scenarioId, adminId);
  await seedWaitingStudents(cycleId);
  await seedActiveSession(cycleId, scenarioId, psychologistId, adminId);
  await seedCompletedSession(cycleId, scenarioId, psychologistId, adminId);

  log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("[seed] ERROR", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
