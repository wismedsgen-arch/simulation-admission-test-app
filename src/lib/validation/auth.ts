import { z } from "zod";

export const bootstrapAdminSchema = z.object({
  fullName: z.string().trim().min(3),
  password: z.string().min(8)
});

export const staffSignupSchema = z.object({
  fullName: z.string().trim().min(3),
  password: z.string().min(8),
  requestedRole: z.enum(["PSYCHOLOGIST", "ADMIN"])
});

export const staffLoginSchema = z.object({
  fullName: z.string().trim().min(3),
  password: z.string().min(8)
});

export const studentLoginSchema = z.object({
  fullName: z.string().trim().min(3),
  governmentId: z.string().trim().min(5),
  accessCode: z.string().trim().min(4)
});
