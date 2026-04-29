import { z } from 'zod';

export const emailSchema = z.string().email().max(254);
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be E.164 (e.g. +971501234567)');

export const usernameSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,30}$/, 'Username: 3–30 chars, lowercase letters, digits, underscore');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Must include a special character');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional().default(false),
  turnstileToken: z.string().optional(),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    fullName: z.string().min(1).max(200),
    phone: phoneSchema.optional(),
    consentAccepted: z.literal(true, {
      error: 'You must accept the privacy policy to register',
    }),
    policyVersion: z.string().min(1),
    turnstileToken: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  token: z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
});

export const verifyEmailOtpSchema = z.object({
  email: emailSchema,
  token: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const resendEmailOtpSchema = z.object({
  email: emailSchema,
});

export const inviteCreateSchema = z.object({
  email: emailSchema,
  role: z.enum(['pro', 'customer', 'employee']),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
  fullName: z.string().min(1).max(200),
  phone: phoneSchema.optional(),
  consentAccepted: z.literal(true),
  policyVersion: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
