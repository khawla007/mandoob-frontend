import { z } from 'zod';

export const COST_DATA_JURISDICTIONS = ['mainland', 'free_zone', 'offshore'] as const;
export const COST_DATA_FEE_TYPES = [
  'license',
  'registration',
  'office_flexi',
  'office_physical',
  'office_virtual',
  'shareholder',
  'visa',
  'addon_bank_account',
  'addon_tax_registration',
  'addon_document_attestation',
] as const;
export const COST_DATA_RECURRENCES = ['one_time', 'annual'] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const nullableText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

export function parseAedToMinor(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error('Amount must be a positive AED value');
    return Math.round(value * 100);
  }
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error('Amount must be a valid AED value');
  const [dirhams, fils = ''] = trimmed.split('.');
  return Number(dirhams) * 100 + Number(fils.padEnd(2, '0'));
}

export function formatMinorAsAed(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

const amountMinorInput = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return parseAedToMinor(value);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid amount',
    });
    return z.NEVER;
  }
});

const booleanInput = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  ctx.addIssue({ code: 'custom', message: 'Expected boolean value' });
  return z.NEVER;
});

const requiredDocumentKeysInput = z.union([z.string(), z.array(z.string())]).transform((value) => {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
});

export const costDataBaseSchema = z
  .object({
    jurisdiction: z.enum(COST_DATA_JURISDICTIONS),
    authority: z.string().trim().min(2).max(160),
    emirate: nullableText,
    activityKey: nullableText,
    feeType: z.enum(COST_DATA_FEE_TYPES),
    label: z.string().trim().min(2).max(220),
    amount: amountMinorInput,
    currency: z.literal('AED').default('AED'),
    recurrence: z.enum(COST_DATA_RECURRENCES),
    minShareholders: z.coerce.number().int().min(1).max(50).default(1),
    maxShareholders: z.coerce.number().int().min(1).max(50).default(50),
    minVisas: z.coerce.number().int().min(0).max(200).default(0),
    maxVisas: z.coerce.number().int().min(0).max(200).default(200),
    timelineMinDays: z.coerce.number().int().min(0).default(0),
    timelineMaxDays: z.coerce.number().int().min(0).default(0),
    requiredDocumentKeys: requiredDocumentKeysInput.default([]),
    estimateGrade: booleanInput.default(true),
    active: booleanInput.default(true),
    validFrom: dateSchema,
    validTo: z.union([dateSchema, z.literal(''), z.null()]).optional().transform((value) => value || null),
  })
  .superRefine((value, ctx) => {
    if (value.minShareholders > value.maxShareholders) {
      ctx.addIssue({ code: 'custom', path: ['maxShareholders'], message: 'Max shareholders must be greater than min' });
    }
    if (value.minVisas > value.maxVisas) {
      ctx.addIssue({ code: 'custom', path: ['maxVisas'], message: 'Max visas must be greater than min' });
    }
    if (value.timelineMinDays > value.timelineMaxDays) {
      ctx.addIssue({ code: 'custom', path: ['timelineMaxDays'], message: 'Max timeline must be greater than min' });
    }
    if (value.validTo && value.validTo < value.validFrom) {
      ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'Valid to must be on or after valid from' });
    }
  });

export const createCostDataSchema = costDataBaseSchema;
export const updateCostDataSchema = costDataBaseSchema.extend({ id: z.string().uuid() });
export const toggleCostDataSchema = z.object({ id: z.string().uuid(), active: z.boolean() });

export type CostDataFormInput = z.input<typeof createCostDataSchema>;
export type ParsedCostDataInput = z.output<typeof createCostDataSchema>;

export type CostDataCsvParseResult =
  | { ok: true; rows: ParsedCostDataInput[] }
  | { ok: false; errors: string[] };

export type CostDataCsvExportRow = {
  id: string;
  jurisdiction: string;
  authority: string;
  emirate: string | null;
  activityKey: string | null;
  feeType: string;
  label: string;
  amountMinor: number;
  currency: 'AED';
  recurrence: string;
  minShareholders: number;
  maxShareholders: number;
  minVisas: number;
  maxVisas: number;
  timelineMinDays: number;
  timelineMaxDays: number;
  requiredDocumentKeys: string[];
  estimateGrade: boolean;
  active: boolean;
  validFrom: string;
  validTo: string | null;
};

export function parseCostDataCsv(text: string): CostDataCsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return { ok: false, errors: ['CSV must include a header and at least one row'] };

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows: ParsedCostDataInput[] = [];
  const errors: string[] = [];

  for (const [index, line] of lines.slice(1).entries()) {
    const values = splitCsvLine(line);
    const raw = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex] ?? '']));
    const parsed = createCostDataSchema.safeParse({
      jurisdiction: raw.jurisdiction,
      authority: raw.authority,
      emirate: raw.emirate,
      activityKey: raw.activity_key,
      feeType: raw.fee_type,
      label: raw.label,
      amount: raw.amount_aed ?? raw.amount,
      currency: raw.currency || 'AED',
      recurrence: raw.recurrence,
      minShareholders: raw.min_shareholders,
      maxShareholders: raw.max_shareholders,
      minVisas: raw.min_visas,
      maxVisas: raw.max_visas,
      timelineMinDays: raw.timeline_min_days,
      timelineMaxDays: raw.timeline_max_days,
      requiredDocumentKeys: (raw.required_document_keys ?? '').replaceAll('|', ','),
      estimateGrade: raw.estimate_grade || 'true',
      active: raw.active || 'true',
      validFrom: raw.valid_from,
      validTo: raw.valid_to,
    });
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      errors.push(`Row ${index + 2}: ${parsed.error.issues[0].message}`);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function costDataRowsToCsv(rows: CostDataCsvExportRow[]): string {
  const headers = [
    'id',
    'jurisdiction',
    'authority',
    'emirate',
    'activity_key',
    'fee_type',
    'label',
    'amount_aed',
    'currency',
    'recurrence',
    'min_shareholders',
    'max_shareholders',
    'min_visas',
    'max_visas',
    'timeline_min_days',
    'timeline_max_days',
    'required_document_keys',
    'estimate_grade',
    'active',
    'valid_from',
    'valid_to',
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.jurisdiction,
      row.authority,
      row.emirate ?? '',
      row.activityKey ?? '',
      row.feeType,
      row.label,
      formatMinorAsAed(row.amountMinor),
      row.currency,
      row.recurrence,
      row.minShareholders,
      row.maxShareholders,
      row.minVisas,
      row.maxVisas,
      row.timelineMinDays,
      row.timelineMaxDays,
      row.requiredDocumentKeys.join('|'),
      row.estimateGrade,
      row.active,
      row.validFrom,
      row.validTo ?? '',
    ].map(csvEscape).join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
