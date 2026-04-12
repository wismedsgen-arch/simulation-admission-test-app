import { z } from "zod";

const textDirectionSchema = z.enum(["AUTO", "LTR", "RTL"]);

export const scenarioSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().trim().min(10),
  openingInstructions: z.string().trim().min(20),
  openingInstructionsDirection: textDirectionSchema.default("AUTO"),
  psychologistInstructions: z.string().trim().min(20),
  psychologistInstructionsDirection: textDirectionSchema.default("AUTO"),
  durationMinutes: z.coerce.number().int().min(30).max(180)
});

export const scenarioRoleSchema = z.object({
  scenarioId: z.string().min(1),
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  descriptionDirection: textDirectionSchema.default("AUTO"),
  accentColor: z.string().min(4).default("#4285f4"),
  emailAddress: z.string().trim().email().or(z.literal("")).optional()
});

export const scenarioTemplateSchema = z.object({
  scenarioId: z.string().min(1),
  roleId: z.string().min(1),
  kind: z.enum(["PRELOADED", "FOLLOW_UP"]),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  bodyDirection: textDirectionSchema.default("AUTO")
});

export const scenarioFileSchema = z.object({
  scenarioId: z.string().min(1),
  name: z.string().trim().min(1),
  textContent: z.string().trim().optional().or(z.literal("")),
  textDirection: textDirectionSchema.default("AUTO")
});

export const examCycleSchema = z.object({
  name: z.string().trim().min(3),
  scenarioId: z.string().min(1)
});

export const claimStudentSchema = z.object({
  cycleStudentId: z.string().min(1)
});

export const startSessionSchema = z.object({
  cycleStudentId: z.string().min(1)
});

export const sendMessageSchema = z.object({
  sessionId: z.string().min(1),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  bodyDirection: textDirectionSchema.default("AUTO"),
  recipientName: z.string().trim().min(1),
  senderRoleId: z.string().optional(),
  replyToId: z.string().optional()
});
