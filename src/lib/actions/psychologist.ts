"use server";

import { ActorType, CycleStudentStatus, SessionStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";
import { persistFiles } from "@/lib/storage/upload-files";
import { detectTextDirection } from "@/lib/utils";
import { sendMessageSchema, startSessionSchema } from "@/lib/validation/domain";

type ActionResult = {
  error?: string;
  success?: string;
};

async function findRecentDuplicateMessage(input: {
  sessionId: string;
  senderType: ActorType;
  senderRoleId?: string | null;
  senderDisplayName: string;
  recipientName: string;
  subject: string;
  body: string;
  replyToId?: string | null;
}) {
  return prisma.sessionMessage.findFirst({
    where: {
      sessionId: input.sessionId,
      senderType: input.senderType,
      senderRoleId: input.senderRoleId ?? null,
      senderDisplayName: input.senderDisplayName,
      recipientName: input.recipientName,
      subject: input.subject,
      body: input.body,
      replyToId: input.replyToId ?? null,
      sentAt: {
        gte: new Date(Date.now() - 15_000)
      }
    },
    select: { id: true }
  });
}

function revalidatePsychologistPaths(sessionId?: string) {
  revalidatePath("/psychologist");
  revalidatePath("/psychologist/sessions");
  revalidatePath("/student");
  revalidatePath("/review");

  if (sessionId) {
    revalidatePath(`/review/${sessionId}`);
  }
}

async function ensurePsychologist() {
  const actor = await requireStaff();

  if (actor.role !== UserRole.PSYCHOLOGIST && actor.role !== UserRole.ADMIN) {
    throw new Error("Only psychologists and admins can access this area.");
  }

  return actor;
}

async function writeAudit(userId: string, action: string, entityType: string, entityId: string, metadata?: unknown) {
  await prisma.auditLog.create({
    data: {
      actorType: ActorType.STAFF,
      userId,
      action,
      entityType,
      entityId,
      metadata: metadata as object | undefined
    }
  });
}

export async function claimStudentAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();
  const cycleStudentId = String(formData.get("cycleStudentId") ?? "");

  try {
    const student = await prisma.$transaction(async (tx) => {
      const current = await tx.examCycleStudent.findUnique({
        where: { id: cycleStudentId }
      });

      if (!current || current.status !== CycleStudentStatus.WAITING) {
        throw new Error("That student is no longer available in the waiting pool.");
      }

      return tx.examCycleStudent.update({
        where: { id: cycleStudentId },
        data: {
          status: CycleStudentStatus.CLAIMED,
          claimedById: actor.userId,
          claimedAt: new Date()
        }
      });
    });

    await writeAudit(actor.userId, "claim_student", "ExamCycleStudent", student.id);
    revalidatePsychologistPaths();
    return { success: `${student.fullName} claimed successfully.` };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not claim the student."
    };
  }
}

export async function unclaimStudentAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  const cycleStudentId = String(formData.get("cycleStudentId") ?? "");

  const cycleStudent = await prisma.examCycleStudent.findUnique({
    where: { id: cycleStudentId },
    include: { session: true }
  });

  if (!cycleStudent || cycleStudent.claimedById !== actor.userId) {
    return { error: "This student is not claimed by your account." };
  }

  if (cycleStudent.session) {
    return { error: "Prepared sessions cannot be unclaimed. End the session instead if needed." };
  }

  await prisma.examCycleStudent.update({
    where: { id: cycleStudent.id },
    data: {
      status: CycleStudentStatus.WAITING,
      claimedById: null,
      claimedAt: null
    }
  });

  await writeAudit(actor.userId, "unclaim_student", "ExamCycleStudent", cycleStudent.id);
  revalidatePsychologistPaths();
  return { success: `${cycleStudent.fullName} returned to the waiting pool.` };
}

export async function startSessionAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();
  const parsed = startSessionSchema.safeParse({
    cycleStudentId: formData.get("cycleStudentId")
  });

  if (!parsed.success) {
    return { error: "Missing student selection." };
  }

  const cycleStudent = await prisma.examCycleStudent.findUnique({
    where: { id: parsed.data.cycleStudentId },
    include: {
      examCycle: {
        include: {
          scenario: {
            include: {
              templates: {
                where: { kind: "PRELOADED", isEnabled: true },
                include: { role: true, attachments: true },
                orderBy: { sendOrder: "asc" }
              }
            }
          }
        }
      },
      session: true
    }
  });

  if (!cycleStudent || cycleStudent.claimedById !== actor.userId) {
    return { error: "This student is not claimed by your account." };
  }

  if (cycleStudent.session) {
    revalidatePath("/psychologist");
    return { success: "Session already prepared for this student." };
  }

  const scenario = cycleStudent.examCycle.scenario;

  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.session.create({
      data: {
        examCycleId: cycleStudent.examCycleId,
        cycleStudentId: cycleStudent.id,
        scenarioId: scenario.id,
        assignedPsychologistId: actor.userId,
        startedById: actor.userId,
        status: SessionStatus.READY
      }
    });

    for (const template of scenario.templates) {
      const message = await tx.sessionMessage.create({
        data: {
          sessionId: createdSession.id,
          templateId: template.id,
          senderType: ActorType.SYSTEM,
          senderRoleId: template.roleId,
          senderDisplayName: template.role.name,
          recipientName: cycleStudent.fullName,
          subject: template.subject,
          body: template.body,
          bodyDirection: template.bodyDirection
        }
      });

      if (template.attachments.length > 0) {
        await tx.sessionAttachment.createMany({
          data: template.attachments.map((attachment) => ({
            messageId: message.id,
            storageKey: attachment.storageKey,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes
          }))
        });
      }
    }

    await tx.examCycleStudent.update({
      where: { id: cycleStudent.id },
      data: {
        status: CycleStudentStatus.READY,
        readyAt: new Date()
      }
    });

    await tx.examCycle.update({
      where: { id: cycleStudent.examCycleId },
      data: {
        status: "LIVE"
      }
    });

    return createdSession;
  });

  await writeAudit(actor.userId, "start_session_prepare", "Session", session.id);
  revalidatePsychologistPaths(session.id);
  return { success: "Session prepared and preloaded emails delivered." };
}

export async function prepareClaimedStudentsAction(
  _prevState: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();

  const claimedStudents = await prisma.examCycleStudent.findMany({
    where: {
      claimedById: actor.userId,
      status: {
        in: [CycleStudentStatus.CLAIMED, CycleStudentStatus.READY, CycleStudentStatus.ACTIVE]
      }
    },
    include: {
      examCycle: {
        include: {
          scenario: {
            include: {
              templates: {
                where: { kind: "PRELOADED", isEnabled: true },
                include: { role: true, attachments: true },
                orderBy: { sendOrder: "asc" }
              }
            }
          }
        }
      },
      session: true
    },
    orderBy: { claimedAt: "asc" }
  });

  if (claimedStudents.length === 0) {
    return { error: "Claim at least one student before preparing the test desk." };
  }

  const existingFirstSession = claimedStudents.find((student) => student.session)?.session?.id ?? null;
  const studentsToPrepare = claimedStudents.filter((student) => !student.session);

  if (studentsToPrepare.length === 0 && existingFirstSession) {
    revalidatePsychologistPaths(existingFirstSession);
    redirect(`/psychologist/sessions?session=${existingFirstSession}`);
  }

  if (studentsToPrepare.length === 0) {
    return { error: "No claimed students are ready for preparation." };
  }

  const preparedSessionIds: string[] = [];

  const firstSessionId = await prisma.$transaction(async (tx) => {
    let selectedSessionId = existingFirstSession;
    const liveCycleIds = new Set<string>();

    for (const cycleStudent of studentsToPrepare) {
      const session = await tx.session.create({
        data: {
          examCycleId: cycleStudent.examCycleId,
          cycleStudentId: cycleStudent.id,
          scenarioId: cycleStudent.examCycle.scenario.id,
          assignedPsychologistId: actor.userId,
          startedById: actor.userId,
          status: SessionStatus.READY
        }
      });

      preparedSessionIds.push(session.id);

      if (!selectedSessionId) {
        selectedSessionId = session.id;
      }

      for (const template of cycleStudent.examCycle.scenario.templates) {
        const message = await tx.sessionMessage.create({
        data: {
          sessionId: session.id,
          templateId: template.id,
          senderType: ActorType.SYSTEM,
          senderRoleId: template.roleId,
          senderDisplayName: template.role.name,
          recipientName: cycleStudent.fullName,
          subject: template.subject,
          body: template.body,
          bodyDirection: template.bodyDirection
        }
      });

        if (template.attachments.length > 0) {
          await tx.sessionAttachment.createMany({
            data: template.attachments.map((attachment) => ({
              messageId: message.id,
              storageKey: attachment.storageKey,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes
            }))
          });
        }
      }

      await tx.examCycleStudent.update({
        where: { id: cycleStudent.id },
        data: {
          status: CycleStudentStatus.READY,
          readyAt: new Date()
        }
      });

      liveCycleIds.add(cycleStudent.examCycleId);
    }

    for (const cycleId of liveCycleIds) {
      await tx.examCycle.update({
        where: { id: cycleId },
        data: { status: "LIVE" }
      });
    }

    return selectedSessionId;
  });

  await Promise.all(
    preparedSessionIds.map((sessionId) =>
      writeAudit(actor.userId, "start_session_prepare", "Session", sessionId, {
        batch: true,
        preparedCount: preparedSessionIds.length
      })
    )
  );

  if (!firstSessionId) {
    return { error: "Could not prepare the claimed students." };
  }

  revalidatePsychologistPaths(firstSessionId);
  redirect(`/psychologist/sessions?session=${firstSessionId}`);
}

export async function startPreparedSessionsAction(
  _prevState: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();

  const readySessions = await prisma.session.findMany({
    where: {
      assignedPsychologistId: actor.userId,
      status: SessionStatus.READY
    },
    include: {
      scenario: true
    }
  });

  if (readySessions.length === 0) {
    return { error: "There are no released sessions waiting to start." };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const session of readySessions) {
      await tx.session.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.ACTIVE,
          introAcknowledgedAt: now,
          startedAt: now,
          endsAt: new Date(now.getTime() + session.scenario.durationMinutes * 60 * 1000)
        }
      });

      await tx.examCycleStudent.update({
        where: { id: session.cycleStudentId },
        data: {
          status: CycleStudentStatus.ACTIVE,
          activatedAt: now
        }
      });
    }
  });

  await Promise.all(
    readySessions.map((session) =>
      writeAudit(actor.userId, "start_prepared_session", "Session", session.id, { batch: true })
    )
  );

  revalidatePsychologistPaths(readySessions[0]?.id);
  return { success: `Started ${readySessions.length} session${readySessions.length === 1 ? "" : "s"}.` };
}

export async function psychologistSendMessageAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();

  const parsed = sendMessageSchema.safeParse({
    sessionId: formData.get("sessionId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    bodyDirection: formData.get("bodyDirection") ?? detectTextDirection(String(formData.get("body") ?? "")),
    recipientName: formData.get("recipientName"),
    senderRoleId: formData.get("senderRoleId"),
    replyToId: formData.get("replyToId")
  });

  if (!parsed.success || !parsed.data.senderRoleId) {
    return { error: "Complete the message form and choose a sender role." };
  }

  const session = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
    include: {
      cycleStudent: true,
      scenario: {
        include: {
          roles: true
        }
      }
    }
  });

  if (!session || session.assignedPsychologistId !== actor.userId) {
    return { error: "You can only send messages inside your own active sessions." };
  }

  if (session.status !== SessionStatus.ACTIVE) {
    return { error: "The test has not started for this student yet." };
  }

  const senderRole = session.scenario.roles.find((role) => role.id === parsed.data.senderRoleId);

  if (!senderRole) {
    return { error: "That sender role does not belong to this scenario." };
  }

  const duplicate = await findRecentDuplicateMessage({
    sessionId: session.id,
    senderType: ActorType.STAFF,
    senderRoleId: senderRole.id,
    senderDisplayName: senderRole.name,
    recipientName: session.cycleStudent.fullName,
    subject: parsed.data.subject,
    body: parsed.data.body,
    replyToId: parsed.data.replyToId || null
  });

  if (duplicate) {
    return { success: "Message already sent." };
  }

  const message = await prisma.sessionMessage.create({
    data: {
      sessionId: session.id,
      senderType: ActorType.STAFF,
      senderStaffId: actor.userId,
      senderRoleId: senderRole.id,
      senderDisplayName: senderRole.name,
      recipientName: session.cycleStudent.fullName,
      subject: parsed.data.subject,
      body: parsed.data.body,
      bodyDirection: parsed.data.bodyDirection,
      replyToId: parsed.data.replyToId || null
    }
  });

  const files = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0);

  const stored = await persistFiles(files, `session-messages/${message.id}`);

  if (stored.length > 0) {
    await prisma.sessionAttachment.createMany({
      data: stored.map((file) => ({
        messageId: message.id,
        storageKey: file.storageKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes
      }))
    });
  }

  if (parsed.data.replyToId) {
    await prisma.sessionMessage.updateMany({
      where: {
        id: parsed.data.replyToId,
        sessionId: session.id,
        senderType: ActorType.STUDENT
      },
      data: {
        resolvedAt: new Date()
      }
    });
  }

  await writeAudit(actor.userId, "send_staff_message", "SessionMessage", message.id, {
    sessionId: session.id
  });

  revalidatePsychologistPaths(session.id);
  return { success: "Message sent." };
}

export async function sendTemplateEmailAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();
  const sessionId = String(formData.get("sessionId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      cycleStudent: true
    }
  });

  const template = await prisma.scenarioTemplate.findUnique({
    where: { id: templateId },
    include: {
      role: true,
      attachments: true
    }
  });

  if (!session || session.assignedPsychologistId !== actor.userId || !template) {
    return { error: "Could not send this prepared email." };
  }

  if (session.status !== SessionStatus.ACTIVE) {
    return { error: "Start the test before sending prepared emails." };
  }

  const alreadySent = await prisma.sessionMessage.findFirst({
    where: {
      sessionId: session.id,
      templateId: template.id,
      senderType: ActorType.STAFF
    },
    select: { id: true }
  });

  if (alreadySent) {
    return { error: "This prepared email was already used for this student." };
  }

  const message = await prisma.sessionMessage.create({
    data: {
      sessionId: session.id,
      templateId: template.id,
      senderType: ActorType.STAFF,
      senderStaffId: actor.userId,
      senderRoleId: template.roleId,
      senderDisplayName: template.role.name,
      recipientName: session.cycleStudent.fullName,
      subject: template.subject,
      body: template.body,
      bodyDirection: template.bodyDirection
    }
  });

  if (template.attachments.length > 0) {
    await prisma.sessionAttachment.createMany({
      data: template.attachments.map((attachment) => ({
        messageId: message.id,
        storageKey: attachment.storageKey,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes
      }))
    });
  }

  await writeAudit(actor.userId, "send_template_email", "SessionMessage", message.id, {
    templateId: template.id
  });

  revalidatePsychologistPaths(session.id);
  return { success: "Prepared email sent." };
}

export async function extendSessionAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();
  const sessionId = String(formData.get("sessionId") ?? "");
  const minutes = Number(formData.get("minutes") ?? 10);

  const session = await prisma.session.findUnique({
    where: { id: sessionId }
  });

  if (!session || session.assignedPsychologistId !== actor.userId) {
    return { error: "Could not find that session." };
  }

  if (session.status !== SessionStatus.ACTIVE) {
    return { error: "Only active sessions can be extended." };
  }

  const nextEndsAt = session.endsAt
    ? new Date(session.endsAt.getTime() + minutes * 60 * 1000)
    : null;

  await prisma.session.update({
    where: { id: session.id },
    data: {
      extensionMinutes: session.extensionMinutes + minutes,
      endsAt: nextEndsAt
    }
  });

  await writeAudit(actor.userId, "extend_session", "Session", session.id, { minutes });
  revalidatePsychologistPaths(session.id);
  return { success: `Extended by ${minutes} minutes.` };
}

export async function markMessageResolvedAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  await expireDueSessions();
  const messageId = String(formData.get("messageId") ?? "");

  const message = await prisma.sessionMessage.findUnique({
    where: { id: messageId },
    include: {
      session: true
    }
  });

  if (
    !message ||
    message.senderType !== ActorType.STUDENT ||
    message.session.assignedPsychologistId !== actor.userId
  ) {
    return { error: "Could not find that student message." };
  }

  if (message.resolvedAt) {
    return { success: "Message already marked as handled." };
  }

  await prisma.sessionMessage.update({
    where: { id: message.id },
    data: {
      resolvedAt: new Date()
    }
  });

  await writeAudit(actor.userId, "resolve_student_message", "SessionMessage", message.id, {
    sessionId: message.sessionId
  });

  revalidatePsychologistPaths(message.sessionId);
  return { success: "Message marked as handled." };
}

export async function trashPsychologistMessageAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  const messageId = String(formData.get("messageId") ?? "");

  const message = await prisma.sessionMessage.findUnique({
    where: { id: messageId },
    include: { session: true }
  });

  if (!message || message.session.assignedPsychologistId !== actor.userId) {
    return { error: "Could not find that email." };
  }

  await prisma.sessionMessage.update({
    where: { id: message.id },
    data: {
      deletedByStaffAt: new Date()
    }
  });

  revalidatePsychologistPaths(message.sessionId);
  return { success: "Email moved to trash." };
}

export async function restorePsychologistMessageAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  const messageId = String(formData.get("messageId") ?? "");

  const message = await prisma.sessionMessage.findUnique({
    where: { id: messageId },
    include: { session: true }
  });

  if (!message || message.session.assignedPsychologistId !== actor.userId) {
    return { error: "Could not find that email." };
  }

  await prisma.sessionMessage.update({
    where: { id: message.id },
    data: {
      deletedByStaffAt: null
    }
  });

  revalidatePsychologistPaths(message.sessionId);
  return { success: "Email restored." };
}

export async function forceEndSessionAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensurePsychologist();
  const sessionId = String(formData.get("sessionId") ?? "");
  const confirmed = formData.get("confirmForceEnd") === "on";

  if (!confirmed) {
    return { error: "Confirm that you want to end the session." };
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId }
  });

  if (!session || session.assignedPsychologistId !== actor.userId) {
    return { error: "Could not find that session." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.FORCED_ENDED,
        endedAt: new Date(),
        endReason: "Ended manually by psychologist"
      }
    });

    await tx.examCycleStudent.update({
      where: { id: session.cycleStudentId },
      data: {
        status: CycleStudentStatus.COMPLETED,
        completedAt: new Date()
      }
    });
  });

  await writeAudit(actor.userId, "force_end_session", "Session", session.id);
  revalidatePsychologistPaths(session.id);

  return { success: "Session ended." };
}
