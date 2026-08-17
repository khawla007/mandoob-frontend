import { z } from 'zod';

const uuid = z.string().uuid();
const reason = z
  .string()
  .trim()
  .refine((value) => Array.from(value).length >= 3, {
    message: 'Reason must contain at least 3 characters',
  })
  .refine((value) => Array.from(value).length <= 500, {
    message: 'Reason must contain at most 500 characters',
  });

export const assignCompanyProSchema = z
  .object({
    companyId: uuid,
    proProfileId: uuid,
  })
  .strict();

export const releaseCompanyProSchema = z
  .object({
    companyId: uuid,
    assignmentId: uuid,
    reason,
  })
  .strict();

export const reassignCompanyProSchema = z
  .object({
    companyId: uuid,
    assignmentId: uuid,
    replacementProProfileId: uuid,
    reason,
  })
  .strict();

export type AssignCompanyProInput = z.infer<typeof assignCompanyProSchema>;
export type ReleaseCompanyProInput = z.infer<typeof releaseCompanyProSchema>;
export type ReassignCompanyProInput = z.infer<typeof reassignCompanyProSchema>;
