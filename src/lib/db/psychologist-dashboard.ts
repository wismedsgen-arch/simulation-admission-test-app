import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const waitingPoolInclude = Prisma.validator<Prisma.ExamCycleStudentInclude>()({
  examCycle: true
});

const claimedPoolInclude = Prisma.validator<Prisma.ExamCycleStudentInclude>()({
  examCycle: true,
  session: true
});

const claimedSessionDeskInclude = Prisma.validator<Prisma.ExamCycleStudentInclude>()({
  examCycle: {
    include: {
      scenario: {
        include: {
          roles: true,
          files: true,
          templates: {
            where: { kind: "FOLLOW_UP", isEnabled: true },
            include: { role: true },
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  },
  session: {
    include: {
      messages: {
        include: {
          attachments: true
        },
        orderBy: { sentAt: "desc" }
      },
      drafts: true
    }
  }
});

export async function getPsychologistWaitingPool() {
  return prisma.examCycleStudent.findMany({
    where: {
      status: "WAITING",
      examCycle: {
        status: {
          in: ["READY", "LIVE"]
        }
      }
    },
    include: waitingPoolInclude,
    orderBy: { createdAt: "asc" }
  });
}

export async function getPsychologistClaimedPool(userId: string) {
  return prisma.examCycleStudent.findMany({
    where: {
      claimedById: userId,
      status: {
        in: ["CLAIMED", "READY", "ACTIVE"]
      }
    },
    include: claimedPoolInclude,
    orderBy: { claimedAt: "asc" }
  });
}

export async function getPsychologistSessionDesk(userId: string) {
  return prisma.examCycleStudent.findMany({
    where: {
      claimedById: userId,
      session: {
        isNot: null
      },
      status: {
        in: ["READY", "ACTIVE"]
      }
    },
    include: claimedSessionDeskInclude,
    orderBy: { claimedAt: "asc" }
  });
}

export async function getRecentCompletedSessions() {
  return prisma.session.findMany({
    where: {
      status: {
        in: ["COMPLETED", "FORCED_ENDED", "EXPIRED"]
      }
    },
    include: {
      cycleStudent: true
    },
    orderBy: { endedAt: "desc" },
    take: 8
  });
}
