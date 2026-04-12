import { ActorType, UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { createSessionToken, hashSessionToken } from "@/lib/auth/crypto";

const COOKIE_NAME = "medical-school-session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type StaffActor = {
  actorType: "STAFF";
  userId: string;
  role: UserRole;
  fullName: string;
};

export type StudentActor = {
  actorType: "STUDENT";
  cycleStudentId: string;
  fullName: string;
};

type SessionActor = StaffActor | StudentActor;

export async function createStaffSession(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);

  await prisma.appSession.create({
    data: {
      tokenHash,
      actorType: ActorType.STAFF,
      userId,
      expiresAt: new Date(Date.now() + THIRTY_DAYS * 1000)
    }
  });

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS
  });
}

export async function createStudentSession(cycleStudentId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);

  await prisma.appSession.create({
    data: {
      tokenHash,
      actorType: ActorType.STUDENT,
      cycleStudentId,
      expiresAt: new Date(Date.now() + THIRTY_DAYS * 1000)
    }
  });

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token) {
    await prisma.appSession.deleteMany({
      where: {
        tokenHash: hashSessionToken(token)
      }
    });
  }

  jar.delete(COOKIE_NAME);
}

export async function getCurrentActor(): Promise<SessionActor | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.appSession.findUnique({
    where: {
      tokenHash: hashSessionToken(token)
    },
    include: {
      user: true,
      cycleStudent: true
    }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  if (session.actorType === ActorType.STAFF && session.user) {
    return {
      actorType: ActorType.STAFF,
      userId: session.user.id,
      role: session.user.role,
      fullName: session.user.fullName
    };
  }

  if (session.actorType === ActorType.STUDENT && session.cycleStudent) {
    return {
      actorType: ActorType.STUDENT,
      cycleStudentId: session.cycleStudent.id,
      fullName: session.cycleStudent.fullName
    };
  }

  return null;
}

export async function requireStaff(role?: UserRole): Promise<StaffActor> {
  const actor = await getCurrentActor();

  if (!actor || actor.actorType !== ActorType.STAFF) {
    redirect("/staff/login");
  }

  if (role && actor.role !== role) {
    redirect(actor.role === UserRole.ADMIN ? "/admin" : "/psychologist");
  }

  return actor;
}

export async function requireStudent(): Promise<StudentActor> {
  const actor = await getCurrentActor();

  if (!actor || actor.actorType !== ActorType.STUDENT) {
    redirect("/student/login");
  }

  return actor;
}

export async function hasApprovedAdmin() {
  const count = await prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      isApproved: true
    }
  });

  return count > 0;
}
