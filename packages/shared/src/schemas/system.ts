import { z } from "zod";
import { DateTimeStringSchema } from "./common.js";

export const UpdateAdminProfileInputSchema = z.object({
  username: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(120),
  email: z.union([z.literal(""), z.string().email()]),
  avatarUrl: z.string().trim().default("")
});
export type UpdateAdminProfileInput = z.infer<typeof UpdateAdminProfileInputSchema>;

export const ChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
    confirmPassword: z.string().min(12)
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match"
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

export const MaintenanceActionInputSchema = z.object({
  action: z.enum(["expired-sessions", "orphan-uploads", "expired-analytics", "expired-trash"])
});
export type MaintenanceActionInput = z.infer<typeof MaintenanceActionInputSchema>;

export const BackupManifestSchema = z.object({
  format: z.literal("tworiver-backup"),
  version: z.literal(1),
  createdAt: DateTimeStringSchema,
  databaseFile: z.string().min(1),
  uploadsDirectory: z.string().min(1),
  checksums: z.record(z.string().regex(/^[0-9a-f]{64}$/))
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;
