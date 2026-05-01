import { z } from 'zod';

const PHONE_E164 = /^\+[1-9]\d{6,14}$/;

export const ProfileBaseSchema = z
  .object({
    display_name: z.string().trim().min(2).max(50),
  })
  .strict();

export const ProfilePhoneSchema = z
  .object({
    display_name: z.string().trim().min(2).max(50),
    phone: z.string().regex(PHONE_E164),
  })
  .strict();

export const PasswordChangeSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z
      .string()
      .min(10)
      .regex(/[A-Z]/, 'Need an uppercase letter')
      .regex(/[a-z]/, 'Need a lowercase letter')
      .regex(/\d/, 'Need a digit'),
    confirm_password: z.string(),
  })
  .strict()
  .refine((d) => d.new_password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

export const MfaEnrollFinalizeSchema = z
  .object({
    factor_id: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const RoleProSchema = z
  .object({
    license_no: z.string().max(50).optional(),
    designation: z.string().max(100).optional(),
    department: z.string().max(100).optional(),
    service_areas: z.array(z.string().max(50)).max(20).default([]),
    bio: z.string().max(500).optional(),
  })
  .strict();

export const RoleCustomerSchema = z
  .object({
    nationality: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    passport_no: z
      .string()
      .min(5)
      .max(20)
      .regex(/^[A-Z0-9]+$/)
      .optional(),
  })
  .strict();

export const RoleEmployeeSchema = z
  .object({
    passport_no: z
      .string()
      .min(5)
      .max(20)
      .regex(/^[A-Z0-9]+$/)
      .optional(),
  })
  .strict();

export type ProfileBaseInput = z.infer<typeof ProfileBaseSchema>;
export type ProfilePhoneInput = z.infer<typeof ProfilePhoneSchema>;
export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;
export type MfaEnrollFinalizeInput = z.infer<typeof MfaEnrollFinalizeSchema>;
export type RoleProInput = z.infer<typeof RoleProSchema>;
export type RoleCustomerInput = z.infer<typeof RoleCustomerSchema>;
export type RoleEmployeeInput = z.infer<typeof RoleEmployeeSchema>;
