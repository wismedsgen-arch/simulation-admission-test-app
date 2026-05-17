/**
 * Phase H — cycle-closure helper.
 *
 * Given an ExamCycle id, compute the transitive set of row ids that belong
 * to that cycle's export bundle: the scenario it runs, the roles/templates/
 * scenario files that scenario owns, the cycle's students/sessions/messages/
 * attachments/drafts, every user referenced by any of those rows, plus a
 * conservative slice of AuditLog rows.
 *
 * The closure intentionally over-includes audit logs (any log whose
 * `entityId`, `cycleStudentId`, or `userId` lands in the closure). Per
 * direction, we'd rather carry a few extra log rows than try to perfectly
 * classify which logs are "about" the cycle.
 */
import type { PrismaClient } from "@prisma/client";

export type CycleClosure = {
  cycleId: string;
  cycleIds: Set<string>;
  scenarioIds: Set<string>;
  scenarioRoleIds: Set<string>;
  scenarioTemplateIds: Set<string>;
  scenarioTemplateAttachmentIds: Set<string>;
  scenarioFileIds: Set<string>;
  cycleStudentIds: Set<string>;
  sessionIds: Set<string>;
  sessionMessageIds: Set<string>;
  sessionAttachmentIds: Set<string>;
  draftIds: Set<string>;
  userIds: Set<string>;
  auditLogIds: Set<string>;
  storageKeys: Set<string>;
};

export async function computeCycleClosure(
  prisma: PrismaClient,
  cycleId: string
): Promise<CycleClosure> {
  const cycle = await prisma.examCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, scenarioId: true, createdById: true }
  });

  if (!cycle) {
    throw new Error(`ExamCycle not found: ${cycleId}`);
  }

  const userIds = new Set<string>([cycle.createdById]);

  const [scenarioMeta, roles, templates, scenarioFiles, students, sessions] =
    await Promise.all([
      prisma.scenario.findUnique({
        where: { id: cycle.scenarioId },
        select: { id: true, createdById: true }
      }),
      prisma.scenarioRole.findMany({
        where: { scenarioId: cycle.scenarioId },
        select: { id: true }
      }),
      prisma.scenarioTemplate.findMany({
        where: { scenarioId: cycle.scenarioId },
        select: { id: true }
      }),
      prisma.scenarioFile.findMany({
        where: { scenarioId: cycle.scenarioId },
        select: { id: true, storageKey: true, uploadedByUserId: true }
      }),
      prisma.examCycleStudent.findMany({
        where: { examCycleId: cycleId },
        select: { id: true, claimedById: true }
      }),
      prisma.session.findMany({
        where: { examCycleId: cycleId },
        select: {
          id: true,
          assignedPsychologistId: true,
          startedById: true
        }
      })
    ]);

  if (scenarioMeta?.createdById) userIds.add(scenarioMeta.createdById);

  const templateIds = templates.map((t) => t.id);
  const sessionIdList = sessions.map((s) => s.id);

  const [templateAttachments, messages, drafts] = await Promise.all([
    prisma.scenarioTemplateAttachment.findMany({
      where: { templateId: { in: templateIds } },
      select: { id: true, storageKey: true }
    }),
    prisma.sessionMessage.findMany({
      where: { sessionId: { in: sessionIdList } },
      select: { id: true, senderStaffId: true }
    }),
    prisma.draft.findMany({
      where: { sessionId: { in: sessionIdList } },
      select: { id: true, authorStaffId: true }
    })
  ]);

  const messageIdList = messages.map((m) => m.id);

  const sessionAttachments = await prisma.sessionAttachment.findMany({
    where: { messageId: { in: messageIdList } },
    select: {
      id: true,
      storageKey: true,
      uploadedByType: true,
      uploadedById: true
    }
  });

  for (const s of students) {
    if (s.claimedById) userIds.add(s.claimedById);
  }
  for (const s of sessions) {
    userIds.add(s.assignedPsychologistId);
    userIds.add(s.startedById);
  }
  for (const m of messages) {
    if (m.senderStaffId) userIds.add(m.senderStaffId);
  }
  for (const d of drafts) {
    if (d.authorStaffId) userIds.add(d.authorStaffId);
  }
  for (const f of scenarioFiles) {
    if (f.uploadedByUserId) userIds.add(f.uploadedByUserId);
  }
  for (const a of sessionAttachments) {
    if (a.uploadedByType === "STAFF" && a.uploadedById) {
      userIds.add(a.uploadedById);
    }
  }

  const storageKeys = new Set<string>();
  for (const f of scenarioFiles) {
    if (f.storageKey) storageKeys.add(f.storageKey);
  }
  for (const a of templateAttachments) {
    storageKeys.add(a.storageKey);
  }
  for (const a of sessionAttachments) {
    storageKeys.add(a.storageKey);
  }

  const cycleStudentIds = students.map((s) => s.id);

  const entityIds = new Set<string>([
    cycle.id,
    cycle.scenarioId,
    ...roles.map((r) => r.id),
    ...templates.map((t) => t.id),
    ...templateAttachments.map((a) => a.id),
    ...scenarioFiles.map((f) => f.id),
    ...cycleStudentIds,
    ...sessionIdList,
    ...messageIdList,
    ...sessionAttachments.map((a) => a.id),
    ...drafts.map((d) => d.id),
    ...userIds
  ]);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityId: { in: [...entityIds] } },
        { cycleStudentId: { in: cycleStudentIds } },
        { userId: { in: [...userIds] } }
      ]
    },
    select: { id: true }
  });

  return {
    cycleId,
    cycleIds: new Set([cycle.id]),
    scenarioIds: new Set([cycle.scenarioId]),
    scenarioRoleIds: new Set(roles.map((r) => r.id)),
    scenarioTemplateIds: new Set(templates.map((t) => t.id)),
    scenarioTemplateAttachmentIds: new Set(
      templateAttachments.map((a) => a.id)
    ),
    scenarioFileIds: new Set(scenarioFiles.map((f) => f.id)),
    cycleStudentIds: new Set(cycleStudentIds),
    sessionIds: new Set(sessionIdList),
    sessionMessageIds: new Set(messageIdList),
    sessionAttachmentIds: new Set(sessionAttachments.map((a) => a.id)),
    draftIds: new Set(drafts.map((d) => d.id)),
    userIds,
    auditLogIds: new Set(auditLogs.map((a) => a.id)),
    storageKeys
  };
}
