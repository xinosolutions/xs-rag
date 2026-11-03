import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Name must be at least 1 character').max(80, 'Name cannot exceed 80 characters'),
});

export type CreateWorkspaceDto = z.infer<typeof createWorkspaceSchema>;

export const renameWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Name must be at least 1 character').max(80, 'Name cannot exceed 80 characters'),
});

export type RenameWorkspaceDto = z.infer<typeof renameWorkspaceSchema>;

export const updateSettingsSchema = z.object({
  modelId: z.string().trim().min(1, 'Model ID is required'),
});

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('invalid_email'),
  role: z.enum(['ADMIN', 'MEMBER'], {
    message: 'invalid_role',
  }),
});

export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER'], {
    message: 'invalid_role',
  }),
});

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;
