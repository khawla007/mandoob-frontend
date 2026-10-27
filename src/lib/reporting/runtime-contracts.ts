import { z } from 'zod';
import { ApiError } from '@/lib/errors';

const operationalReportSchema = z.object({
  reportVersion: z.literal(1),
  scope: z.enum(['platform', 'company']),
  generatedAt: z.string().datetime(),
  businessTimezone: z.literal('Asia/Dubai'),
  state: z.enum(['ready', 'partial', 'unavailable']),
  counts: z.object({
    companies: z.number().int().nonnegative(),
    activeEmployees: z.number().int().nonnegative(),
    overdueRenewals: z.number().int().nonnegative(),
    scheduledMeetings: z.number().int().nonnegative(),
    contactIntakes: z.number().int().nonnegative(),
    submittedApplications: z.number().int().nonnegative(),
    registrations: z.number().int().nonnegative(),
    postedFinanceJournals: z.number().int().nonnegative(),
  }),
  sourceFreshness: z.record(z.string(), z.string().datetime()),
  unavailableSources: z.array(z.string().regex(/^[A-Z0-9_]+$/u)).max(20),
});

export type OperationalReport = z.infer<typeof operationalReportSchema>;

export function parseOperationalReport(value: unknown): OperationalReport {
  return operationalReportSchema.parse(value);
}

export function validateExportSearchParams(params: URLSearchParams): Record<string, never> {
  for (const key of params.keys()) {
    if (params.getAll(key).length !== 1) {
      throw new ApiError('INVALID_FILTER', 'Unsupported export filter', 400);
    }
    throw new ApiError('INVALID_FILTER', 'Unsupported export filter', 400);
  }
  return {};
}
