"use server";

import { ActorType, CycleStudentStatus, RequestStatus, SessionStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import {
  createStaffSession,
  createStudentSession,
  destroySession,
  hasApprovedAdmin
} from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { generateInternalStaffIdentifier, normalizeInput, normalizeNameKey } from "@/lib/utils";
import {
  bootstrapAdminSchema,
  staffLoginSchema,
  staffSignupSchema,
  studentLoginSchema
} from "@/lib/validation/auth";

type ActionResult = {
  error?: string;
  success?: string;
};

export async function bootstrapAdminAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (await hasApprovedAdmin()) {
    return {
      error: "An admin already exists. Use the staff signup flow instead."
    };
  }

  const parsed = bootstrapAdminSchema.safeParse({
    fullName: normalizeInput(String(formData.get("fullName") ?? "")),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Please complete all fields with valid values." };
  }

  const admin = await prisma.user.create({
    data: {
      fullName: parsed.data.fullName,
      governmentId: generateInternalStaffIdentifier(parsed.data.fullName),
      passwordHash: await hashPassword(parsed.data.password),
      role: UserRole.ADMIN,
      isApproved: true
    }
  });

  await prisma.auditLog.create({
    data: {
      actorType: ActorType.SYSTEM,
      action: "bootstrap_admin",
      entityType: "User",
      entityId: admin.id,
      metadata: {
        fullName: admin.fullName
      }
    }
  });

  await createStaffSession(admin.id);
  redirect("/admin");
}

export async function requestStaffSignupAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = staffSignupSchema.safeParse({
    fullName: normalizeInput(String(formData.get("fullName") ?? "")),
    password: formData.get("password"),
    requestedRole: formData.get("requestedRole")
  });

  if (!parsed.success) {
    return { error: "Please check the signup request form and try again." };
  }

  const [pendingRequests, approvedUsers] = await Promise.all([
    prisma.staffSignupRequest.findMany({
      where: {
        status: RequestStatus.PENDING
      },
      select: {
        id: true,
        fullName: true
      }
    }),
    prisma.user.findMany({
      where: {
        isApproved: true
      },
      select: {
        id: true,
        fullName: true
      }
    })
  ]);

  const requestedNameKey = normalizeNameKey(parsed.data.fullName);
  const exists = pendingRequests.find((request) => normalizeNameKey(request.fullName) === requestedNameKey);
  const approvedUser = approvedUsers.find((user) => normalizeNameKey(user.fullName) === requestedNameKey);

  if (exists || approvedUser) {
    return {
      error: "A signup request or approved account already exists for this name."
    };
  }

  await prisma.staffSignupRequest.create({
    data: {
      fullName: parsed.data.fullName,
      governmentId: generateInternalStaffIdentifier(parsed.data.fullName),
      passwordHash: await hashPassword(parsed.data.password),
      requestedRole: parsed.data.requestedRole
    }
  });

  return {
    success: "Request submitted. An admin must approve it before you can sign in."
  };
}

export async function staffLoginAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = staffLoginSchema.safeParse({
    fullName: normalizeInput(String(formData.get("fullName") ?? "")),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Enter your full name and password." };
  }

  const approvedUsers = await prisma.user.findMany({
    where: {
      isApproved: true
    }
  });

  const user = approvedUsers.find((candidate) => normalizeNameKey(candidate.fullName) === normalizeNameKey(parsed.data.fullName));

  if (!user || !user.isApproved) {
    return { error: "No approved staff account matched those details." };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!valid) {
    return { error: "Incorrect password." };
  }

  await createStaffSession(user.id);
  redirect(user.role === UserRole.ADMIN ? "/admin" : "/psychologist");
}

export async function studentLoginAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = studentLoginSchema.safeParse({
    fullName: normalizeInput(String(formData.get("fullName") ?? "")),
    governmentId: normalizeInput(String(formData.get("governmentId") ?? "")),
    accessCode: normalizeInput(String(formData.get("accessCode") ?? ""))
  });

  if (!parsed.success) {
    return { error: "Enter your full name, ID, and access code." };
  }

  const exam = await prisma.examCycle.findFirst({
    where: {
      accessCode: parsed.data.accessCode,
      status: {
        in: ["READY", "LIVE"]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!exam) {
    return {
      error: "No active exam matched that access code."
    };
  }

  const existingStudent = await prisma.examCycleStudent.findUnique({
    where: {
      examCycleId_governmentId: {
        examCycleId: exam.id,
        governmentId: parsed.data.governmentId
      }
    },
    include: {
      session: true
    }
  });

  if (existingStudent && existingStudent.fullName !== parsed.data.fullName) {
    return { error: "That government ID is already registered under a different name for this exam." };
  }

  const student =
    existingStudent ??
    (await prisma.examCycleStudent.create({
      data: {
        examCycleId: exam.id,
        fullName: parsed.data.fullName,
        governmentId: parsed.data.governmentId,
        accessCode: exam.accessCode,
        status: CycleStudentStatus.WAITING
      }
    }));

  if (
    student.status === CycleStudentStatus.COMPLETED ||
    existingStudent?.session?.status === SessionStatus.COMPLETED ||
    existingStudent?.session?.status === SessionStatus.FORCED_ENDED ||
    existingStudent?.session?.status === SessionStatus.EXPIRED
  ) {
    return {
      error: "This exam session has already ended and can no longer be reopened."
    };
  }

  await createStudentSession(student.id);
  redirect("/student");
}

export async function logoutAction() {
  await destroySession();
  revalidatePath("/");
  redirect("/");
}
