"use server";

import { ActorType, CycleStudentStatus, SessionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireStudent } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";
import { persistFiles } from "@/lib/storage/upload-files";
import { detectTextDirection } from "@/lib/utils";
import { sendMessageSchema } from "@/lib/validation/domain";

type ActionResult = {
  error?: string;
  success?: string;
};

async function findRecentDuplicateStudentMessage(input: {
  sessionId: string;
  senderDisplayName: string;
  recipientName: string;
  subject: string;
  body: string;
  replyToId?: string | null;
}) {
  return prisma.sessionMessage.findFirst({
    where: {
      sessionId: input.sessionId,
      senderType: ActorType.STUDENT,
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

async function writeStudentAudit(cycleStudentId: string, action: string, entityType: string, entityId: string, metadata?: unknown) {
  await prisma.auditLog.create({
    data: {
      actorType: ActorType.STUDENT,
      cycleStudentId,
      action,
      entityType,
      entityId,
      metadata: metadata as object | undefined
    }
  });
}

export async function beginStudentSessionAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireStudent();
  await expireDueSessions();
  const sessionId = String(formData.get("sessionId") ?? "");

  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      cycleStudentId: actor.cycleStudentId,
      status: SessionStatus.READY
    },
    include: {
      scenario: true
    }
  });

  if (!session) {
    return { error: "This session is not ready to begin." };
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + session.scenario.durationMinutes * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.ACTIVE,
        introAcknowledgedAt: now,
        startedAt: now,
        endsAt
      }
    });

    await tx.examCycleStudent.update({
      where: { id: actor.cycleStudentId },
      data: {
        status: CycleStudentStatus.ACTIVE,
        activatedAt: now
      }
    });
  });

  await writeStudentAudit(actor.cycleStudentId, "start_student_session", "Session", session.id);
  revalidatePath("/student");
  revalidatePath("/psychologist");
  revalidatePath("/psychologist/sessions");
  return { success: "Session started." };
}

export async function studentSendMessageAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireStudent();
  await expireDueSessions();

  const parsed = sendMessageSchema.safeParse({
    sessionId: formData.get("sessionId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    bodyDirection: formData.get("bodyDirection") ?? detectTextDirection(String(formData.get("body") ?? "")),
    recipientName: formData.get("recipientName"),
    senderRoleId: formData.get("senderRoleId") || undefined,
    replyToId: formData.get("replyToId") || undefined
  });

  if (!parsed.success || !parsed.data.senderRoleId) {
    return { error: "Choose a recipient and complete your message." };
  }

  const session = await prisma.session.findFirst({
    where: {
      id: parsed.data.sessionId,
      cycleStudentId: actor.cycleStudentId
    },
    include: {
      cycleStudent: true,
      scenario: {
        include: {
          roles: true
        }
      }
    }
  });

  if (!session || session.status !== SessionStatus.ACTIVE) {
    return { error: "This session is not accepting new student messages." };
  }

  const recipientRole = session.scenario.roles.find((role) => role.id === parsed.data.senderRoleId);

  if (!recipientRole) {
    return { error: "That recipient is not part of this scenario." };
  }

  const duplicate = await findRecentDuplicateStudentMessage({
    sessionId: session.id,
    senderDisplayName: session.cycleStudent.fullName,
    recipientName: recipientRole.name,
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
      senderType: ActorType.STUDENT,
      senderDisplayName: session.cycleStudent.fullName,
      recipientName: recipientRole.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      bodyDirection: parsed.data.bodyDirection,
      replyToId: parsed.data.replyToId || null,
      requiresResponse: true
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

  await writeStudentAudit(actor.cycleStudentId, "send_student_message", "SessionMessage", message.id);
  revalidatePath("/student");
  revalidatePath("/psychologist");
  revalidatePath("/psychologist/sessions");

  return { success: "Message sent." };
}

export async function trashStudentMessageAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireStudent();
  const messageId = String(formData.get("messageId") ?? "");

  const message = await prisma.sessionMessage.findUnique({
    where: { id: messageId },
    include: {
      session: true
    }
  });

  if (!message || message.session.cycleStudentId !== actor.cycleStudentId) {
    return { error: "Could not find that email." };
  }

  await prisma.sessionMessage.update({
    where: { id: message.id },
    data: {
      deletedByStudentAt: new Date()
    }
  });

  revalidatePath("/student");
  return { success: "Email moved to trash." };
}

export async function restoreStudentMessageAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireStudent();
  const messageId = String(formData.get("messageId") ?? "");

  const message = await prisma.sessionMessage.findUnique({
    where: { id: messageId },
    include: {
      session: true
    }
  });

  if (!message || message.session.cycleStudentId !== actor.cycleStudentId) {
    return { error: "Could not find that email." };
  }

  await prisma.sessionMessage.update({
    where: { id: message.id },
    data: {
      deletedByStudentAt: null
    }
  });

  revalidatePath("/student");
  return { success: "Email restored." };
}
