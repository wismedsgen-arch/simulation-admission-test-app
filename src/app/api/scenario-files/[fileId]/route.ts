import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getFileBuffer } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const actor = await getCurrentActor();

  if (!actor) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { fileId } = await params;
  const scenarioFile = await prisma.scenarioFile.findUnique({
    where: { id: fileId }
  });

  if (!scenarioFile || scenarioFile.kind !== "UPLOAD" || !scenarioFile.storageKey || !scenarioFile.fileName || !scenarioFile.mimeType) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (actor.actorType === "STUDENT") {
    const cycleStudent = await prisma.examCycleStudent.findUnique({
      where: { id: actor.cycleStudentId },
      include: {
        examCycle: {
          select: {
            scenarioId: true
          }
        }
      }
    });

    if (!cycleStudent || cycleStudent.examCycle.scenarioId !== scenarioFile.scenarioId) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if (actor.actorType === "STAFF") {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        role: true
      }
    });

    if (user?.role !== UserRole.ADMIN) {
      const hasAccess = await prisma.session.findFirst({
        where: {
          scenarioId: scenarioFile.scenarioId,
          assignedPsychologistId: actor.userId
        },
        select: { id: true }
      });

      if (!hasAccess) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
  }

  const file = await getFileBuffer(scenarioFile.storageKey);

  return new NextResponse(file, {
    headers: {
      "Content-Type": scenarioFile.mimeType,
      "Content-Disposition": `attachment; filename="${scenarioFile.fileName}"`
    }
  });
}
