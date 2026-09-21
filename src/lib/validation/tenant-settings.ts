import { z } from 'zod';

/** Match 0093's bounded URL subset without WHATWG DNS/IPv4 normalization. */
function validSettingsHttpUrl(value: string): boolean {
  if (value === '') return true;
  if (/[\s\u0000-\u001f\u007f\\]/u.test(value)) return false;
  const parts = /^https?:\/\/([^/?#]+)([/?#][^\s]*)?$/u.exec(value);
  if (!parts || parts[1].includes('@')) return false;
  const authority = parts[1];
  let port: string | undefined;
  if (authority.startsWith('[')) {
    const ipv6 = /^\[([0-9A-Fa-f:.]+)\](?::([0-9]{1,5}))?$/u.exec(authority);
    if (!ipv6) return false;
    port = ipv6[2];
    try {
      new URL(`http://[${ipv6[1]}]/`);
    } catch {
      return false;
    }
  } else {
    const hostParts = /^([^:]+)(?::([0-9]{1,5}))?$/u.exec(authority);
    if (!hostParts) return false;
    const host = hostParts[1];
    port = hostParts[2];
    if (host.length > 253) return false;
    if (/^[0-9.]+$/u.test(host)) {
      if (
        !/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/u.test(host) ||
        host.split('.').some((octet) => Number(octet) > 255)
      )
        return false;
    } else if (
      host.split('.').some((label) => !/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label))
    )
      return false;
  }
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65535);
}

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(validSettingsHttpUrl, 'Must be a valid HTTP(S) URL')
  .nullable();

const settingsEmail = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/u, 'Must be a valid email')
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const optionalEmail = settingsEmail.or(z.literal('')).nullable();

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #4f46e5')
  .or(z.literal(''))
  .nullable();

export const brandingSchema = z.object({
  name: z.string().trim().min(2).max(200),
  logo_url: optionalUrl,
  favicon_url: optionalUrl,
  primary_color: hexColor,
  secondary_color: hexColor,
});
export type BrandingInput = z.infer<typeof brandingSchema>;

export const contactSchema = z.object({
  email_sender_name: z.string().trim().max(120).nullable(),
  email_reply_to: optionalEmail,
  terms_url: optionalUrl,
  privacy_url: optionalUrl,
});
export type ContactInput = z.infer<typeof contactSchema>;

export const smtpSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, 'Host is required')
    .max(253)
    .regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/u, 'Must be a valid SMTP host'),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().min(1, 'Username is required').max(200),
  // Empty string => leave existing password untouched on update.
  password: z.string().max(500).optional().or(z.literal('')),
  from_address: settingsEmail,
  enabled: z.boolean(),
});
export type SmtpInput = z.infer<typeof smtpSchema>;

const metaId = z
  .string()
  .trim()
  .regex(/^[0-9]{5,32}$/, 'Use the numeric Meta ID');

export const whatsappSchema = z.object({
  phone_number_id: metaId,
  business_account_id: metaId,
  access_token: z.string().trim().max(500).optional().or(z.literal('')),
  enabled: z.boolean(),
});
export type WhatsAppInput = z.infer<typeof whatsappSchema>;

export const settingsOperationSchema = z.object({
  operation_id: z.string().uuid(),
  expected_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
