import { ScenarioFileKind, TemplateKind, TextDirection, UserRole } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/crypto";
import { prisma } from "../src/lib/db/prisma";
import scenarioData from "./scenario-ron-lab.json";

// ---------------------------------------------------------------------------
// Admin bootstrap
// ---------------------------------------------------------------------------

async function seedAdmin(): Promise<string | null> {
  const name = process.env.BOOTSTRAP_ADMIN_NAME;
  const governmentId = process.env.BOOTSTRAP_ADMIN_ID;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  // Original behaviour: if any env var is missing, do nothing.
  if (!name || !governmentId || !password) {
    return null;
  }

  const existing = await prisma.user.findUnique({ where: { governmentId } });

  // Original behaviour: if the admin already exists, skip creation.
  // We still return the ID so the scenario seed can run against the live DB.
  if (existing) {
    return existing.id;
  }

  const admin = await prisma.user.create({
    data: {
      fullName: name,
      governmentId,
      passwordHash: await hashPassword(password),
      role: UserRole.ADMIN,
      isApproved: true
    }
  });

  console.log(`Created admin: ${admin.fullName} (${admin.id})`);
  return admin.id;
}

// ---------------------------------------------------------------------------
// Scenario seed
// ---------------------------------------------------------------------------

async function seedScenario(createdById: string) {
  const existing = await prisma.scenario.findFirst({
    where: { name: scenarioData.scenario.name }
  });

  if (existing) {
    console.log(`Scenario "${scenarioData.scenario.name}" already exists — skipping.`);
    return;
  }

  // ------------------------------------------------------------------
  // 1. Scenario
  // ------------------------------------------------------------------
  const scenario = await prisma.scenario.create({
    data: {
      name: scenarioData.scenario.name,
      description: scenarioData.scenario.description,
      openingTitle: scenarioData.scenario.openingTitle,
      openingInstructions: scenarioData.scenario.openingInstructions,
      openingInstructionsDirection: scenarioData.scenario.openingInstructionsDirection as TextDirection,
      psychologistInstructions: scenarioData.scenario.psychologistInstructions,
      psychologistInstructionsDirection: scenarioData.scenario.psychologistInstructionsDirection as TextDirection,
      durationMinutes: scenarioData.scenario.durationMinutes,
      createdById
    }
  });

  console.log(`\nCreated scenario: "${scenario.name}" (${scenario.id})`);

  // ------------------------------------------------------------------
  // 2. Roles — build key → Prisma ID map for template references
  // ------------------------------------------------------------------
  const roleKeyMap: Record<string, string> = {};

  for (const roleData of scenarioData.roles) {
    const role = await prisma.scenarioRole.create({
      data: {
        scenarioId: scenario.id,
        name: roleData.name,
        category: roleData.category,
        description: roleData.description || null,
        descriptionDirection: roleData.descriptionDirection as TextDirection,
        accentColor: roleData.accentColor,
        emailAddress: roleData.emailAddress
      }
    });

    roleKeyMap[roleData.key] = role.id;
    console.log(`  Role [${roleData.key}]: ${roleData.name} → ${role.id}`);
  }

  // ------------------------------------------------------------------
  // 3. Email templates (PRELOADED and FOLLOW_UP)
  // ------------------------------------------------------------------
  const preloaded = scenarioData.templates.filter((t) => t.kind === "PRELOADED");
  const followUp = scenarioData.templates.filter((t) => t.kind === "FOLLOW_UP");

  for (const templateData of scenarioData.templates) {
    const roleId = roleKeyMap[templateData.roleKey];

    if (!roleId) {
      throw new Error(
        `Unknown roleKey "${templateData.roleKey}" in template "${templateData.subject}". ` +
          `Available keys: ${Object.keys(roleKeyMap).join(", ")}`
      );
    }

    await prisma.scenarioTemplate.create({
      data: {
        scenarioId: scenario.id,
        roleId,
        kind: templateData.kind as TemplateKind,
        sendOrder: templateData.sendOrder ?? null,
        subject: templateData.subject,
        body: templateData.body,
        bodyDirection: templateData.bodyDirection as TextDirection,
        isEnabled: true
      }
    });
  }

  console.log(
    `  Templates: ${preloaded.length} PRELOADED (ordered 1–${preloaded.length}), ` +
      `${followUp.length} FOLLOW_UP (בלת"מים)`
  );

  // ------------------------------------------------------------------
  // 4. Scenario files (drive documents)
  // ------------------------------------------------------------------
  for (const fileData of scenarioData.files) {
    await prisma.scenarioFile.create({
      data: {
        scenarioId: scenario.id,
        name: fileData.name,
        kind: "TEXT" as ScenarioFileKind,
        textContent: fileData.textContent,
        textDirection: fileData.textDirection as TextDirection,
        storageKey: null,
        fileName: null,
        mimeType: null,
        sizeBytes: null
      }
    });
  }

  console.log(`  Files: ${scenarioData.files.length} text documents`);
  console.log(`\nScenario seeded successfully.\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const adminId = await seedAdmin();

  if (!adminId) {
    return;
  }

  await seedScenario(adminId);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
