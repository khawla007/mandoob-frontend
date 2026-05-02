import { z } from 'zod';

const optionalUrl = z.string().trim().url('Must be a valid URL').optional().or(z.literal(''));

const optionalEmail = z.string().trim().email('Must be a valid email').optional().or(z.literal(''));

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #4f46e5')
  .optional()
  .or(z.literal(''));

export const brandingSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  logo_url: optionalUrl,
  favicon_url: optionalUrl,
  primary_color: hexColor,
  secondary_color: hexColor,
});
export type BrandingInput = z.infer<typeof brandingSchema>;

export const contactSchema = z.object({
  email_sender_name: z.string().trim().max(120).optional().or(z.literal('')),
  email_reply_to: optionalEmail,
  terms_url: optionalUrl,
  privacy_url: optionalUrl,
});
export type ContactInput = z.infer<typeof contactSchema>;

export const smtpSchema = z.object({
  host: z.string().trim().min(1, 'Host is required').max(253),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().min(1, 'Username is required').max(200),
  // Empty string => leave existing password untouched on update.
  password: z.string().max(500).optional().or(z.literal('')),
  from_address: z.string().trim().email('Must be a valid email'),
  enabled: z.boolean(),
});
export type SmtpInput = z.infer<typeof smtpSchema>;
