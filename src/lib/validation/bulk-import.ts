import { z } from 'zod';
import { emailSchema, phoneSchema } from './auth';

const optionalCell = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalIsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional()
  .or(z.literal(''));

export const employeeCsvRowSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: emailSchema.optional().or(z.literal('')),
  phone: phoneSchema.optional().or(z.literal('')),
  nationality: optionalCell(2),
  passport_no: optionalCell(50),
  visa_no: optionalCell(50),
  visa_expiry: optionalIsoDate,
  emirates_id: z
    .string()
    .trim()
    .regex(/^784-\d{4}-\d{7}-\d$/, 'Format: 784-YYYY-NNNNNNN-N')
    .optional()
    .or(z.literal('')),
  eid_expiry: optionalIsoDate,
});

export type BulkImportKind = 'employees';
export type EmployeeCsvRow = z.output<typeof employeeCsvRowSchema>;
export type ValidatedEmployeeCsvRow = { rowNumber: number; value: EmployeeCsvRow };

export type BulkImportValidationError = {
  row_number: number;
  field: string;
  message: string;
  code: 'VALIDATION_FAILED';
};

export type BulkImportValidationResult = {
  kind: 'employees';
  totalRows: number;
  validRows: ValidatedEmployeeCsvRow[];
  errors: BulkImportValidationError[];
};

export function countDistinctImportErrorRows(errors: Array<{ row_number: number }>): number {
  return new Set(errors.map((error) => error.row_number)).size;
}

export function parseCsvRows(csv: string): Record<string, string>[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? '').trim()])),
    );
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

export function validateBulkImportRows(
  kind: BulkImportKind,
  rows: Record<string, string>[],
): BulkImportValidationResult {
  const errors: BulkImportValidationError[] = [];
  const validRows: ValidatedEmployeeCsvRow[] = [];

  rows.forEach((row, index) => {
    const parsed = employeeCsvRowSchema.safeParse(row);
    if (parsed.success) {
      validRows.push({ rowNumber: index + 2, value: parsed.data });
      return;
    }

    for (const issue of parsed.error.issues) {
      errors.push({
        row_number: index + 2,
        field: issue.path.join('.') || 'row',
        message: issue.message,
        code: 'VALIDATION_FAILED',
      });
    }
  });

  return { kind, totalRows: rows.length, validRows, errors };
}
