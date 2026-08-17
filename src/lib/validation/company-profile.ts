import { z } from 'zod';
import { isValidCalendarDate } from './calendar-date';

export const companyProfileSchema = z.object({
  company_name: z.string().trim().min(2, 'companyNameRequired').max(200, 'companyNameTooLong'),
  trade_license_no: z.string().trim().max(64, 'tradeLicenseTooLong'),
  jurisdiction: z.string().trim().max(120, 'jurisdictionTooLong'),
  license_expiry: z
    .string()
    .refine((value) => value === '' || isValidCalendarDate(value), 'licenseExpiryInvalid'),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
