import { ActorType, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";

export async function POST(request: Request) {
  const actor = await getCurrentActor();

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  await expireDueSessions();
  const sessionId = String(body.sessionId ?? "");
  const subject = String(body.subject ?? "");
  const messageBody = String(body.body ?? "");
  const recipientRoleId = body.recipientRoleId ? String(body.recipientRoleId) : null;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId }
  });

  if (!session) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

  if ("cycleStudentId" in actor && session.cycleStudentId !== actor.cycleStudentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if ("userId" in actor && session.assignedPsychologistId !== actor.userId) {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId }
    });

    if (user?.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const existing = await prisma.draft.findFirst({
    where:
      "userId" in actor
        ? {
            sessionId,
            authorType: ActorType.STAFF,
            authorStaffId: actor.userId
          }
        : {
            sessionId,
            authorType: ActorType.STUDENT,
            authorStudentId: actor.cycleStudentId
          }
  });

  if (existing) {
    await prisma.draft.update({
      where: { id: existing.id },
      data: {
        subject,
        body: messageBody,
        recipientRoleId
      }
    });
  } else {
    await prisma.draft.create({
      data:
        "userId" in actor
          ? {
              sessionId,
              authorType: ActorType.STAFF,
              authorStaffId: actor.userId,
              subject,
              body: messageBody,
              recipientRoleId
            }
          : {
              sessionId,
              authorType: ActorType.STUDENT,
              authorStudentId: actor.cycleStudentId,
              subject,
              body: messageBody,
              recipientRoleId
            }
    });
  }

  return NextResponse.json({ ok: true });
}
