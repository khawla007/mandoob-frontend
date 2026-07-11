import { z } from 'zod';

export const inviteColleagueSchema = z.object({
  full_name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  role: z.enum(['pro', 'admin']),
});
export type InviteColleagueInput = z.infer<typeof inviteColleagueSchema>;

export const changeMemberRoleSchema = z.object({
  target_id: z.string().uuid(),
  new_role: z.enum(['pro', 'admin']),
});
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;

export const setMemberStatusSchema = z.object({
  target_id: z.string().uuid(),
  new_status: z.enum(['active', 'suspended']),
  reason: z.string().min(1).max(280).optional(),
});
export type SetMemberStatusInput = z.infer<typeof setMemberStatusSchema>;

export const resendInviteSchema = z.object({
  target_id: z.string().uuid(),
});
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;
