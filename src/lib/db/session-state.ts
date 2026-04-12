import { CycleStudentStatus, SessionStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function expireDueSessions() {
  const dueSessions = await prisma.session.findMany({
    where: {
      status: SessionStatus.ACTIVE,
      endsAt: {
        lt: new Date()
      }
    },
    select: {
      id: true,
      cycleStudentId: true
    }
  });

  if (dueSessions.length === 0) {
    return;
  }

  const sessionIds = dueSessions.map((session) => session.id);
  const cycleStudentIds = dueSessions.map((session) => session.cycleStudentId);
  const endedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        id: {
          in: sessionIds
        }
      },
      data: {
        status: SessionStatus.EXPIRED,
        endedAt,
        endReason: "Time expired"
      }
    });

    await tx.examCycleStudent.updateMany({
      where: {
        id: {
          in: cycleStudentIds
        }
      },
      data: {
        status: CycleStudentStatus.COMPLETED,
        completedAt: endedAt
      }
    });
  });
}
