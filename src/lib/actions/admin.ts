"use server";

import {
  ActorType,
  CycleStudentStatus,
  ExamCycleStatus,
  RequestStatus,
  UserRole
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword } from "@/lib/auth/crypto";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { persistFiles } from "@/lib/storage/upload-files";
import {
  generateAccessCode,
  generateInternalStaffIdentifier,
  isProtectedAdminName,
  normalizeInput,
  normalizeNameKey,
  suggestRoleEmailLabel
} from "@/lib/utils";
import {
  examCycleSchema,
  scenarioFileSchema,
  scenarioRoleSchema,
  scenarioSchema,
  scenarioTemplateSchema
} from "@/lib/validation/domain";

type ActionResult = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

async function ensureAdmin() {
  return requireStaff(UserRole.ADMIN);
}

async function writeAdminAudit(action: string, entityType: string, entityId: string, metadata?: unknown) {
  const actor = await ensureAdmin();
  await prisma.auditLog.create({
    data: {
      actorType: ActorType.STAFF,
      userId: actor.userId,
      action,
      entityType,
      entityId,
      metadata: metadata as object | undefined
    }
  });
}

export async function approveSignupRequestAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensureAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const role = String(formData.get("role") ?? "PSYCHOLOGIST") as UserRole;

  const request = await prisma.staffSignupRequest.findUnique({
    where: { id: requestId }
  });

  if (!request || request.status !== RequestStatus.PENDING) {
    return { error: "That signup request is no longer available." };
  }

  const approvedUsers = await prisma.user.findMany({
    where: {
      isApproved: true
    },
    select: {
      id: true,
      fullName: true
    }
  });

  const existingUser = approvedUsers.find((user) => normalizeNameKey(user.fullName) === normalizeNameKey(request.fullName));

  if (existingUser) {
    return { error: "An approved staff account with that name already exists." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        fullName: request.fullName,
        governmentId: request.governmentId,
        passwordHash: request.passwordHash,
        role,
        isApproved: true
      }
    });

    await tx.staffSignupRequest.update({
      where: { id: request.id },
      data: {
        status: RequestStatus.APPROVED,
        reviewedAt: new Date(),
        approvedById: actor.userId
      }
    });
  });

  await writeAdminAudit("approve_staff_signup", "StaffSignupRequest", request.id, { role });
  revalidatePath("/admin");

  return { success: "Staff request approved." };
}

export async function rejectSignupRequestAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensureAdmin();
  const requestId = String(formData.get("requestId") ?? "");

  await prisma.staffSignupRequest.update({
    where: { id: requestId },
    data: {
      status: RequestStatus.REJECTED,
      reviewedAt: new Date(),
      approvedById: actor.userId
    }
  });

  await writeAdminAudit("reject_staff_signup", "StaffSignupRequest", requestId);
  revalidatePath("/admin");

  return { success: "Request rejected." };
}

export async function createScenarioAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensureAdmin();
  const parsed = scenarioSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    openingInstructions: formData.get("openingInstructions"),
    openingInstructionsDirection: formData.get("openingInstructionsDirection") ?? "AUTO",
    psychologistInstructions: formData.get("psychologistInstructions"),
    psychologistInstructionsDirection: formData.get("psychologistInstructionsDirection") ?? "AUTO",
    durationMinutes: formData.get("durationMinutes")
  });

  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([k, msgs]) => [k, msgs[0]])
    );
    return { fieldErrors };
  }

  const scenario = await prisma.scenario.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      openingTitle: parsed.data.name,
      openingInstructions: parsed.data.openingInstructions,
      openingInstructionsDirection: parsed.data.openingInstructionsDirection,
      psychologistInstructions: parsed.data.psychologistInstructions,
      psychologistInstructionsDirection: parsed.data.psychologistInstructionsDirection,
      durationMinutes: parsed.data.durationMinutes,
      createdById: actor.userId
    }
  });

  await writeAdminAudit("create_scenario", "Scenario", scenario.id, { name: scenario.name });
  redirect(`/admin/scenarios/${scenario.id}?tab=roles`);
}

export async function updateScenarioAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const parsed = scenarioSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    openingInstructions: formData.get("openingInstructions"),
    openingInstructionsDirection: formData.get("openingInstructionsDirection") ?? "AUTO",
    psychologistInstructions: formData.get("psychologistInstructions"),
    psychologistInstructionsDirection: formData.get("psychologistInstructionsDirection") ?? "AUTO",
    durationMinutes: formData.get("durationMinutes")
  });

  if (!scenarioId) {
    return { error: "Scenario not found." };
  }

  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([k, msgs]) => [k, msgs[0]])
    );
    return { fieldErrors };
  }

  await prisma.scenario.update({
    where: { id: scenarioId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      openingTitle: parsed.data.name,
      openingInstructions: parsed.data.openingInstructions,
      openingInstructionsDirection: parsed.data.openingInstructionsDirection,
      psychologistInstructions: parsed.data.psychologistInstructions,
      psychologistInstructionsDirection: parsed.data.psychologistInstructionsDirection,
      durationMinutes: parsed.data.durationMinutes
    }
  });

  await writeAdminAudit("update_scenario", "Scenario", scenarioId, { name: parsed.data.name });
  revalidatePath(`/admin/scenarios/${scenarioId}`);
  revalidatePath("/admin/scenarios");
  return { success: "Scenario details updated." };
}

export async function createScenarioRoleAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();

  const parsed = scenarioRoleSchema.safeParse({
    scenarioId: formData.get("scenarioId"),
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    descriptionDirection: formData.get("descriptionDirection") ?? "AUTO",
    accentColor: formData.get("accentColor"),
    emailAddress: formData.get("emailAddress")
  });

  if (!parsed.success) {
    return { error: "Please fill the role form correctly." };
  }

  const role = await prisma.scenarioRole.create({
    data: {
      scenarioId: parsed.data.scenarioId,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description || null,
      descriptionDirection: parsed.data.descriptionDirection,
      accentColor: parsed.data.accentColor,
      emailAddress: parsed.data.emailAddress || suggestRoleEmailLabel(parsed.data.name)
    }
  });

  await writeAdminAudit("create_scenario_role", "ScenarioRole", role.id, { scenarioId: role.scenarioId });
  revalidatePath(`/admin/scenarios/${role.scenarioId}`);
  return { success: "Scenario role added." };
}

export async function updateScenarioRoleAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();
  const roleId = String(formData.get("roleId") ?? "");
  const parsed = scenarioRoleSchema.safeParse({
    scenarioId: formData.get("scenarioId"),
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    descriptionDirection: formData.get("descriptionDirection") ?? "AUTO",
    accentColor: formData.get("accentColor"),
    emailAddress: formData.get("emailAddress")
  });

  if (!roleId || !parsed.success) {
    return { error: "Please fill the role form correctly." };
  }

  await prisma.scenarioRole.update({
    where: { id: roleId },
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description || null,
      descriptionDirection: parsed.data.descriptionDirection,
      accentColor: parsed.data.accentColor,
      emailAddress: parsed.data.emailAddress || suggestRoleEmailLabel(parsed.data.name)
    }
  });

  await writeAdminAudit("update_scenario_role", "ScenarioRole", roleId, { scenarioId: parsed.data.scenarioId });
  revalidatePath(`/admin/scenarios/${parsed.data.scenarioId}`);
  return { success: "Scenario role updated." };
}

export async function createScenarioTemplateAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();

  const scenarioId = String(formData.get("scenarioId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");

  if (!scenarioId || !roleId) {
    return { error: "Add at least one scenario role before creating email templates." };
  }

  const parsed = scenarioTemplateSchema.safeParse({
    scenarioId,
    roleId,
    kind,
    subject,
    body,
    bodyDirection: formData.get("bodyDirection") ?? "AUTO"
  });

  if (!parsed.success) {
    return { error: "Complete the sender, subject, and body fields for the email template." };
  }

  const nextPreloadedOrder =
    parsed.data.kind === "PRELOADED"
      ? ((await prisma.scenarioTemplate.aggregate({
          where: {
            scenarioId: parsed.data.scenarioId,
            kind: "PRELOADED"
          },
          _max: {
            sendOrder: true
          }
        }))._max.sendOrder ?? 0) + 1
      : null;

  const template = await prisma.scenarioTemplate.create({
    data: {
      scenarioId: parsed.data.scenarioId,
      roleId: parsed.data.roleId,
      kind: parsed.data.kind,
      sendOrder: nextPreloadedOrder,
      subject: parsed.data.subject,
      body: parsed.data.body,
      bodyDirection: parsed.data.bodyDirection
    }
  });

  const files = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0);

  const stored = await persistFiles(files, `scenario-templates/${template.id}`);

  if (stored.length > 0) {
    await prisma.scenarioTemplateAttachment.createMany({
      data: stored.map((file) => ({
        templateId: template.id,
        storageKey: file.storageKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes
      }))
    });
  }

  await writeAdminAudit("create_scenario_template", "ScenarioTemplate", template.id, {
    scenarioId: template.scenarioId,
    kind: template.kind
  });
  revalidatePath(`/admin/scenarios/${template.scenarioId}`);

  return { success: "Email template saved." };
}

export async function createScenarioFileAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();

  const parsed = scenarioFileSchema.safeParse({
    scenarioId: formData.get("scenarioId"),
    name: formData.get("name"),
    textContent: formData.get("textContent"),
    textDirection: formData.get("textDirection") ?? "AUTO"
  });

  if (!parsed.success) {
    return { error: "Complete the scenario file form." };
  }

  const upload = formData.get("file");

  if (!parsed.data.textContent && (!(upload instanceof File) || upload.size === 0)) {
    return { error: "Add text, an uploaded file, or both." };
  }

  let storedFile:
    | {
        storageKey: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
      }
    | undefined;

  if (upload instanceof File && upload.size > 0) {
    [storedFile] = await persistFiles([upload], `scenario-files/${parsed.data.scenarioId}`);
  }

  const scenarioFile = await prisma.scenarioFile.create({
    data: {
      scenarioId: parsed.data.scenarioId,
      name: parsed.data.name,
      kind: storedFile ? "UPLOAD" : "TEXT",
      textContent: parsed.data.textContent || null,
      textDirection: parsed.data.textDirection,
      storageKey: storedFile?.storageKey ?? null,
      fileName: storedFile?.fileName ?? null,
      mimeType: storedFile?.mimeType ?? null,
      sizeBytes: storedFile?.sizeBytes ?? null
    }
  });

  await writeAdminAudit("create_scenario_file", "ScenarioFile", scenarioFile.id, {
    scenarioId: scenarioFile.scenarioId,
    kind: scenarioFile.kind
  });
  revalidatePath(`/admin/scenarios/${scenarioFile.scenarioId}`);
  return { success: "Scenario file saved." };
}

export async function deleteScenarioFileAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();
  const fileId = String(formData.get("fileId") ?? "");

  const scenarioFile = await prisma.scenarioFile.findUnique({
    where: { id: fileId }
  });

  if (!scenarioFile) {
    return { error: "That scenario file no longer exists." };
  }

  await prisma.scenarioFile.delete({
    where: { id: fileId }
  });

  await writeAdminAudit("delete_scenario_file", "ScenarioFile", fileId, {
    scenarioId: scenarioFile.scenarioId
  });
  revalidatePath(`/admin/scenarios/${scenarioFile.scenarioId}`);
  return { success: "Scenario file deleted." };
}

export async function createExamCycleAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensureAdmin();

  const parsed = examCycleSchema.safeParse({
    name: formData.get("name"),
    scenarioId: formData.get("scenarioId")
  });

  if (!parsed.success) {
    return { error: "Please provide an exam name and scenario." };
  }

  const existingCodes = new Set(
    (
      await prisma.examCycle.findMany({
        where: {
          status: {
            in: [ExamCycleStatus.READY, ExamCycleStatus.LIVE]
          }
        },
        select: {
          accessCode: true
        }
      })
    ).map((cycle) => cycle.accessCode)
  );

  let accessCode = generateAccessCode();
  while (existingCodes.has(accessCode)) {
    accessCode = generateAccessCode();
  }

  let cycleId = "";

  try {
    const cycle = await prisma.$transaction(async (tx) => {
      const createdCycle = await tx.examCycle.create({
        data: {
          name: parsed.data.name,
          scenarioId: parsed.data.scenarioId,
          accessCode,
          status: ExamCycleStatus.READY,
          createdById: actor.userId
        }
      });

      return createdCycle;
    });

    cycleId = cycle.id;
    await writeAdminAudit("create_exam_cycle", "ExamCycle", cycle.id, {
      name: cycle.name,
      accessCode
    });
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }

    return { error: "Could not create the exam cycle." };
  }

  redirect(`/admin/exam-cycles/${cycleId}`);
}

export async function reorderPreloadedTemplatesAction(
  scenarioId: string,
  orderedTemplateIds: string[]
): Promise<ActionResult> {
  await ensureAdmin();

  if (!scenarioId || orderedTemplateIds.length === 0) {
    return { error: "No preloaded templates were provided." };
  }

  const templates = await prisma.scenarioTemplate.findMany({
    where: {
      scenarioId,
      kind: "PRELOADED"
    },
    select: {
      id: true
    }
  });

  const knownIds = new Set(templates.map((template) => template.id));
  const invalidId = orderedTemplateIds.find((id) => !knownIds.has(id));

  if (invalidId) {
    return { error: "A template in the requested order no longer exists." };
  }

  await prisma.$transaction(
    orderedTemplateIds.map((templateId, index) =>
      prisma.scenarioTemplate.update({
        where: { id: templateId },
        data: {
          sendOrder: index + 1
        }
      })
    )
  );

  revalidatePath(`/admin/scenarios/${scenarioId}`);
  return { success: "Preloaded order updated." };
}

export async function deleteScenarioTemplateAction(
  templateId: string,
  scenarioId: string
): Promise<ActionResult> {
  await ensureAdmin();

  if (!templateId || !scenarioId) {
    return { error: "That email template could not be found." };
  }

  await prisma.scenarioTemplate.delete({
    where: { id: templateId }
  });

  await writeAdminAudit("delete_scenario_template", "ScenarioTemplate", templateId, { scenarioId });
  revalidatePath(`/admin/scenarios/${scenarioId}`);
  return { success: "Email template deleted." };
}

export async function deleteScenarioAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();
  const scenarioId = String(formData.get("scenarioId") ?? "");

  if (!scenarioId) {
    return { error: "That scenario could not be found." };
  }

  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          cycles: true,
          sessions: true
        }
      }
    }
  });

  if (!scenario) {
    return { error: "That scenario no longer exists." };
  }

  if (scenario._count.cycles > 0 || scenario._count.sessions > 0) {
    return {
      error: "This scenario is already connected to exams or sessions and cannot be deleted safely."
    };
  }

  await prisma.scenario.delete({
    where: { id: scenario.id }
  });

  await writeAdminAudit("delete_scenario", "Scenario", scenario.id, { name: scenario.name });
  redirect("/admin/scenarios");
}

export async function deleteExamCycleAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();
  const cycleId = String(formData.get("cycleId") ?? "");

  await prisma.examCycle.delete({
    where: { id: cycleId }
  });

  await writeAdminAudit("delete_exam_cycle", "ExamCycle", cycleId);
  redirect("/admin/exam-cycles");
}

export async function deleteScenarioRoleAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();
  const roleId = String(formData.get("roleId") ?? "");
  const scenarioId = String(formData.get("scenarioId") ?? "");

  if (!roleId || !scenarioId) {
    return { error: "That scenario role could not be found." };
  }

  await prisma.scenarioRole.delete({
    where: { id: roleId }
  });

  await writeAdminAudit("delete_scenario_role", "ScenarioRole", roleId, { scenarioId });
  revalidatePath(`/admin/scenarios/${scenarioId}`);
  return { success: "Scenario role deleted." };
}

export async function createStaffDirectlyAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await ensureAdmin();
  const fullName = normalizeInput(String(formData.get("fullName") ?? ""));
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "PSYCHOLOGIST") as UserRole;

  if (fullName.length < 3 || password.length < 8) {
    return { error: "Complete the direct staff creation form." };
  }

  const approvedUsers = await prisma.user.findMany({
    where: {
      isApproved: true
    },
    select: {
      id: true,
      fullName: true
    }
  });

  const existingUser = approvedUsers.find((user) => normalizeNameKey(user.fullName) === normalizeNameKey(fullName));

  if (existingUser) {
    return { error: "A staff account with that name already exists." };
  }

  try {
    const user = await prisma.user.create({
      data: {
        fullName,
        governmentId: generateInternalStaffIdentifier(fullName),
        passwordHash: await hashPassword(password),
        role,
        isApproved: true
      }
    });

    await writeAdminAudit("create_staff_directly", "User", user.id, { role });
    revalidatePath("/admin");
    return { success: "Staff member created." };
  } catch {
    return { error: "Could not create staff. The name may already exist." };
  }
}

export async function deleteStaffAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await ensureAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return { error: "That staff account could not be found." };
  }

  if (userId === actor.userId) {
    return { error: "You cannot delete your own admin account while signed in." };
  }

  const staff = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      role: true,
      _count: {
        select: {
          createdScenarios: true,
          createdCycles: true,
          claimedStudents: true,
          assignedSessions: true,
          startedSessions: true
        }
      }
    }
  });

  if (!staff) {
    return { error: "That staff account no longer exists." };
  }

  if (staff.role === UserRole.ADMIN && isProtectedAdminName(staff.fullName)) {
    return { error: "The protected top admin account cannot be deleted." };
  }

  const hasHistory =
    staff._count.createdScenarios > 0 ||
    staff._count.createdCycles > 0 ||
    staff._count.claimedStudents > 0 ||
    staff._count.assignedSessions > 0 ||
    staff._count.startedSessions > 0;

  if (hasHistory) {
    return {
      error:
        "This staff account has historical references and cannot be deleted safely. Remove only unused accounts."
    };
  }

  await prisma.user.delete({
    where: { id: staff.id }
  });

  await writeAdminAudit("delete_staff", "User", staff.id, {
    fullName: staff.fullName,
    role: staff.role
  });
  revalidatePath("/admin");
  return { success: "Staff account deleted." };
}
