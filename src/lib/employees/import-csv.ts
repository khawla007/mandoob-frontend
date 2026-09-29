import {
  employeeCsvRowSchema,
  parseCsvRows,
  type EmployeeCsvRow,
} from '@/lib/validation/bulk-import';

export const IMPORT_LIMITS = { maxBytes: 1_000_000, maxRows: 5_000 } as const;

const ALLOWED_HEADERS = new Set([
  'name',
  'email',
  'phone',
  'nationality',
  'job_title',
  'passport_no',
  'visa_no',
  'visa_expiry',
  'emirates_id',
  'eid_expiry',
]);

export type ImportRowError = { row_number: number; field: string; code: string };
export type ImportEmployeeValue = EmployeeCsvRow & { job_title?: string };
export type ImportRow =
  | { rowNumber: number; outcome: 'valid'; value: ImportEmployeeValue }
  | { rowNumber: number; outcome: 'invalid'; errorCode: string }
  | { rowNumber: number; outcome: 'duplicate_in_file' }
  | { rowNumber: number; outcome: 'duplicate_existing' };

export type ImportValidation =
  | { ok: false; code: string }
  | { ok: true; totalRows: number; errorRows: number; rows: ImportRow[]; errors: ImportRowError[] };

function errorCode(issueCode: string): string {
  return issueCode === 'too_big' || issueCode === 'too_small' ? 'INVALID_LENGTH' : 'INVALID_FORMAT';
}

/**
 * Validates raw CSV bytes before any job exists. Row numbers are 1-based
 * ordinals over non-blank data rows; the worker applies them in this order.
 */
export function validateEmployeeImportBytes(
  bytes: Uint8Array,
  options: { isExistingPassport?: (normalizedPassport: string) => boolean } = {},
): ImportValidation {
  if (bytes.byteLength > IMPORT_LIMITS.maxBytes) return { ok: false, code: 'FILE_TOO_LARGE' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, code: 'INVALID_ENCODING' };
  }
  if (text.includes('\u0000')) return { ok: false, code: 'INVALID_ENCODING' };
  const headerLine = text.replace(/^﻿/u, '').split(/\r?\n/u, 1)[0] ?? '';
  const headers = headerLine.split(',').map((header) => header.trim().replace(/^"|"$/gu, ''));
  if (new Set(headers).size !== headers.length) return { ok: false, code: 'DUPLICATE_HEADER' };
  if (headers.some((header) => !ALLOWED_HEADERS.has(header)))
    return { ok: false, code: 'UNKNOWN_HEADER' };
  if (!headers.includes('name')) return { ok: false, code: 'MISSING_REQUIRED_HEADER' };

  const records = parseCsvRows(text);
  if (records.length === 0) return { ok: false, code: 'NO_ROWS' };
  if (records.length > IMPORT_LIMITS.maxRows) return { ok: false, code: 'TOO_MANY_ROWS' };

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const { job_title: jobTitle, ...rest } = record;
    const parsed = employeeCsvRowSchema.safeParse(rest);
    if (!parsed.success || (jobTitle && jobTitle.length > 120)) {
      const issue = parsed.success ? null : parsed.error.issues[0];
      const field = issue ? String(issue.path[0] ?? 'row') : 'job_title';
      const code = issue ? errorCode(issue.code) : 'INVALID_LENGTH';
      errors.push({ row_number: rowNumber, field, code });
      rows.push({ rowNumber, outcome: 'invalid', errorCode: code });
      return;
    }
    const passport = (parsed.data.passport_no ?? '').trim().toUpperCase();
    if (passport && seen.has(passport)) {
      errors.push({ row_number: rowNumber, field: 'passport_no', code: 'DUPLICATE_IN_FILE' });
      rows.push({ rowNumber, outcome: 'duplicate_in_file' });
      return;
    }
    if (passport) seen.add(passport);
    if (passport && options.isExistingPassport?.(passport)) {
      rows.push({ rowNumber, outcome: 'duplicate_existing' });
      return;
    }
    rows.push({
      rowNumber,
      outcome: 'valid',
      value: {
        ...parsed.data,
        passport_no: passport,
        ...(jobTitle ? { job_title: jobTitle } : {}),
      },
    });
  });
  return {
    ok: true,
    totalRows: records.length,
    errorRows: new Set(errors.map((error) => error.row_number)).size,
    rows,
    errors,
  };
}
