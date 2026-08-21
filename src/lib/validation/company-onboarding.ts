import { z } from 'zod';
import { COMPANY_ONBOARDING_SECTION_KEYS } from '../company-onboarding/contracts';
import { isValidCalendarDate } from './calendar-date';

const collapseWhitespace = (value: string) => value.trim().replace(/\s+/gu, ' ');
const normalizedText = (minimum: number, maximum: number) =>
  z.string().transform(collapseWhitespace).pipe(z.string().min(minimum).max(maximum));
const optionalText = (maximum: number) =>
  z.string().transform(collapseWhitespace).pipe(z.string().max(maximum));
const uuid = z.string().uuid();
const calendarDate = z.string().refine(isValidCalendarDate, 'invalidCalendarDate');

const commandSchema = z.object({
  tenantId: uuid,
  companyId: uuid,
  operationId: uuid,
  expectedVersion: z.number().int().nonnegative(),
});

const sectionCommandSchema = commandSchema.extend({ completeSection: z.boolean() });

export const companyLegalSectionSchema = sectionCommandSchema.extend({
  companyName: normalizedText(2, 200),
  displayName: optionalText(160).refine((value) => value === '' || value.length >= 2),
  jurisdictionType: z.enum(['mainland', 'free_zone', 'offshore']),
  licensingAuthority: normalizedText(2, 120),
  legalStructure: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,63}$/u),
  tradeLicenseNo: z
    .string()
    .transform((value) => collapseWhitespace(value).toUpperCase())
    .pipe(
      z
        .string()
        .min(2)
        .max(64)
        .regex(/^[A-Z0-9][A-Z0-9\- /.]*$/u),
    ),
  licenseExpiry: calendarDate,
});

const ownershipPercent = z.string().regex(/^(?:0|[1-9]\d{0,2})\.\d{4}$/u);
const shareholderBase = z.object({
  id: uuid.optional(),
  ownershipPercent,
  sortOrder: z.number().int().nonnegative(),
});
const individualShareholder = shareholderBase.extend({
  kind: z.literal('individual'),
  fullName: normalizedText(2, 200),
  nationalityCode: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z]{2}$/u)),
  passportNumber: optionalText(64).transform((value) => value.toUpperCase()),
});
const companyShareholder = shareholderBase.extend({
  kind: z.literal('company'),
  legalName: normalizedText(2, 200),
  countryOfIncorporation: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z]{2}$/u)),
  registrationNumber: normalizedText(2, 64).transform((value) => value.toUpperCase()),
});

function decimalTenThousandths(value: string): number {
  return Number(value.replace('.', ''));
}

export const companyShareholdersSectionSchema = sectionCommandSchema
  .extend({
    shareholders: z.array(
      z.discriminatedUnion('kind', [individualShareholder, companyShareholder]),
    ),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    const sortOrders = new Set<number>();
    const identifiers = new Set<string>();
    let total = 0;
    for (const [index, shareholder] of value.shareholders.entries()) {
      total += decimalTenThousandths(shareholder.ownershipPercent);
      const identifier =
        shareholder.kind === 'individual'
          ? shareholder.passportNumber
          : shareholder.registrationNumber;
      if (
        (shareholder.id && ids.has(shareholder.id)) ||
        sortOrders.has(shareholder.sortOrder) ||
        (identifier && identifiers.has(`${shareholder.kind}:${identifier}`))
      ) {
        context.addIssue({ code: 'custom', path: ['shareholders', index], message: 'duplicate' });
      }
      if (shareholder.id) ids.add(shareholder.id);
      sortOrders.add(shareholder.sortOrder);
      if (identifier) identifiers.add(`${shareholder.kind}:${identifier}`);
    }
    if (total > 1_000_000 || (value.completeSection && total !== 1_000_000)) {
      context.addIssue({
        code: 'custom',
        path: ['shareholders'],
        message: 'ownershipTotalInvalid',
      });
    }
    if (value.completeSection && value.shareholders.length === 0) {
      context.addIssue({ code: 'custom', path: ['shareholders'], message: 'shareholderRequired' });
    }
  });

const activitySchema = z.object({
  id: uuid.optional(),
  activityCode: z
    .string()
    .transform((value) => collapseWhitespace(value).toUpperCase())
    .pipe(
      z
        .string()
        .min(2)
        .max(64)
        .regex(/^[A-Z0-9][A-Z0-9._/-]*$/u),
    ),
  activityName: normalizedText(2, 200),
  authorityName: normalizedText(2, 120),
  isPrimary: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export const companyActivitiesSectionSchema = sectionCommandSchema
  .extend({ activities: z.array(activitySchema) })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    const sortOrders = new Set<number>();
    let primaryCount = 0;
    for (const [index, activity] of value.activities.entries()) {
      const key = `${activity.authorityName.toLowerCase()}:${activity.activityCode}`;
      if (
        (activity.id && ids.has(activity.id)) ||
        keys.has(key) ||
        sortOrders.has(activity.sortOrder)
      ) {
        context.addIssue({ code: 'custom', path: ['activities', index], message: 'duplicate' });
      }
      if (activity.id) ids.add(activity.id);
      keys.add(key);
      sortOrders.add(activity.sortOrder);
      if (activity.isPrimary) primaryCount += 1;
    }
    if (value.completeSection && (value.activities.length === 0 || primaryCount !== 1)) {
      context.addIssue({
        code: 'custom',
        path: ['activities'],
        message: 'primaryActivityRequired',
      });
    }
    if (primaryCount > 1) {
      context.addIssue({
        code: 'custom',
        path: ['activities'],
        message: 'multiplePrimaryActivities',
      });
    }
  });

export const companyOfficeSectionSchema = sectionCommandSchema
  .extend({
    officeType: z.enum(['physical', 'flexi_desk', 'virtual']),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    area: optionalText(120),
    city: optionalText(120),
    emirate: optionalText(120),
    postalCode: optionalText(20),
    countryCode: z.literal('AE'),
    providerName: optionalText(120),
    leaseReference: optionalText(120),
    leaseExpiry: z.string().refine((value) => value === '' || isValidCalendarDate(value)),
  })
  .superRefine((value, context) => {
    if (!value.completeSection) return;
    const required = (field: keyof typeof value) => {
      if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: 'required' });
    };
    required('city');
    required('emirate');
    if (value.officeType === 'physical') {
      for (const field of ['addressLine1', 'area', 'leaseReference', 'leaseExpiry'] as const)
        required(field);
    }
    if (value.officeType === 'flexi_desk') {
      for (const field of ['providerName', 'area', 'leaseReference', 'leaseExpiry'] as const)
        required(field);
    }
    if (value.officeType === 'virtual') {
      required('providerName');
      if (Boolean(value.leaseReference) !== Boolean(value.leaseExpiry)) {
        context.addIssue({
          code: 'custom',
          path: ['leaseReference'],
          message: 'leasePairRequired',
        });
      }
    }
  });

export const companyEstablishmentSectionSchema = sectionCommandSchema.extend({
  establishmentCardNumber: normalizedText(2, 64).transform((value) => value.toUpperCase()),
  establishmentCardExpiry: calendarDate,
});

export const companyBankSectionSchema = sectionCommandSchema.extend({
  bankName: normalizedText(2, 120),
  branchName: optionalText(120),
  accountHolderName: normalizedText(2, 200),
  currencyCode: z.literal('AED'),
  swiftBic: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/u)),
  iban: z
    .string()
    .transform((value) => value.replace(/[\s-]+/gu, '').toUpperCase())
    .pipe(z.string().regex(/^(?:AE\d{21})?$/u)),
  accountNumber: z
    .string()
    .transform((value) => value.replace(/[\s-]+/gu, '').toUpperCase())
    .pipe(z.string().regex(/^(?:[A-Z0-9]{2,34})?$/u)),
});

export const clearCompanyBankIdentifierSchema = commandSchema
  .extend({
    identifier: z.enum(['iban', 'account_number']),
    companyNameConfirmation: normalizedText(2, 200),
    expectedCompanyName: normalizedText(2, 200),
  })
  .superRefine((value, context) => {
    if (value.companyNameConfirmation !== value.expectedCompanyName) {
      context.addIssue({
        code: 'custom',
        path: ['companyNameConfirmation'],
        message: 'companyNameConfirmationMismatch',
      });
    }
  });

export const reopenCompanyOnboardingSectionSchema = commandSchema
  .extend({
    section: z.enum(COMPANY_ONBOARDING_SECTION_KEYS),
    reason: normalizedText(3, 500),
    companyNameConfirmation: normalizedText(2, 200),
    expectedCompanyName: normalizedText(2, 200),
  })
  .superRefine((value, context) => {
    if (value.companyNameConfirmation !== value.expectedCompanyName) {
      context.addIssue({
        code: 'custom',
        path: ['companyNameConfirmation'],
        message: 'companyNameConfirmationMismatch',
      });
    }
  });

export const submitCompanyOnboardingSchema = commandSchema;
export const activateCompanyOnboardingSchema = commandSchema;
