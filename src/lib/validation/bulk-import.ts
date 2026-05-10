import { z } from 'zod';
import { createClientSchema } from './client';
import { emailSchema, phoneSchema } from './auth';

const optionalCell = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalIsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional()
  .or(z.literal(''));

export const clientCsvRowSchema = createClientSchema;

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

export type BulkImportKind = 'clients' | 'employees';
export type ClientCsvRow = z.output<typeof clientCsvRowSchema>;
export type EmployeeCsvRow = z.output<typeof employeeCsvRowSchema>;

export type BulkImportValidationError = {
  row_number: number;
  field: string;
  message: string;
};

export type BulkImportValidationResult =
  | {
      kind: 'clients';
      totalRows: number;
      validRows: ClientCsvRow[];
      errors: BulkImportValidationError[];
    }
  | {
      kind: 'employees';
      totalRows: number;
      validRows: EmployeeCsvRow[];
      errors: BulkImportValidationError[];
    };

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
  kind: 'clients',
  rows: Record<string, string>[],
): Extract<BulkImportValidationResult, { kind: 'clients' }>;
export function validateBulkImportRows(
  kind: 'employees',
  rows: Record<string, string>[],
): Extract<BulkImportValidationResult, { kind: 'employees' }>;
export function validateBulkImportRows(
  kind: BulkImportKind,
  rows: Record<string, string>[],
): BulkImportValidationResult {
  const schema = kind === 'clients' ? clientCsvRowSchema : employeeCsvRowSchema;
  const errors: BulkImportValidationError[] = [];
  const validRows: Array<ClientCsvRow | EmployeeCsvRow> = [];

  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      validRows.push(parsed.data);
      return;
    }

    for (const issue of parsed.error.issues) {
      errors.push({
        row_number: index + 2,
        field: issue.path.join('.') || 'row',
        message: issue.message,
      });
    }
  });

  if (kind === 'clients') {
    return { kind, totalRows: rows.length, validRows: validRows as ClientCsvRow[], errors };
  }
  return { kind, totalRows: rows.length, validRows: validRows as EmployeeCsvRow[], errors };
}
