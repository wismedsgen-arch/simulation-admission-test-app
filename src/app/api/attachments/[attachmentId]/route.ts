import { ActorType, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getFileBuffer } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const actor = await getCurrentActor();

  if (!actor) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { attachmentId } = await params;
  const attachment = await prisma.sessionAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: {
        include: {
          session: true
        }
      }
    }
  });

  if (!attachment) {
    return new NextResponse("Not found", { status: 404 });
  }

  const session = attachment.message.session;

  if ("cycleStudentId" in actor) {
    if (session.cycleStudentId !== actor.cycleStudentId) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if ("userId" in actor) {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId }
    });

    const canAccess =
      session.assignedPsychologistId === actor.userId ||
      session.status === "COMPLETED" ||
      session.status === "FORCED_ENDED" ||
      session.status === "EXPIRED" ||
      user?.role === UserRole.ADMIN;

    if (!canAccess) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const file = await getFileBuffer(attachment.storageKey);

  return new NextResponse(file, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${attachment.fileName}"`
    }
  });
}
