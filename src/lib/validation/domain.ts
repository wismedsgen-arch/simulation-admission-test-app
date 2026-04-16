import { z } from "zod";

const textDirectionSchema = z.enum(["AUTO", "LTR", "RTL"]);

export const scenarioSchema = z.object({
  name: z.string().trim().min(3, "Scenario name must be at least 3 characters"),
  description: z.string().trim().min(10, "Description must be at least 10 characters"),
  openingInstructions: z.string().trim().min(20, "Opening instructions must be at least 20 characters"),
  openingInstructionsDirection: textDirectionSchema.default("AUTO"),
  psychologistInstructions: z.string().trim().min(20, "Psychologist instructions must be at least 20 characters"),
  psychologistInstructionsDirection: textDirectionSchema.default("AUTO"),
  durationMinutes: z.coerce
    .number({ invalid_type_error: "Duration must be a number" })
    .int("Duration must be a whole number")
    .min(30, "Duration must be at least 30 minutes")
    .max(180, "Duration cannot exceed 180 minutes")
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
