import { z } from 'zod';

export const questionnaireAddOnSchema = z.enum([
  'bank_account',
  'tax_registration',
  'document_attestation',
  'pro_services',
]);

export const questionnaireAnswersSchema = z
  .object({
    source: z.literal('questionnaire').default('questionnaire'),
    fullName: z.string().trim().min(2).max(160),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254)
      .nullable()
      .optional(),
    phone: z.string().trim().min(7).max(32).nullable().optional(),
    nationality: z.string().trim().min(2).max(80),
    activity: z.string().trim().min(2).max(120),
    preferredNames: z.array(z.string().trim().min(2).max(120)).length(3),
    businessSummary: z.string().trim().min(10).max(2000),
    jurisdiction: z.enum(['mainland', 'free_zone', 'offshore']),
    authority: z.string().trim().min(2).max(120),
    shareholderCount: z.coerce.number().int().min(1).max(50),
    shareholderSplitSummary: z.string().trim().max(1000).nullable().optional(),
    investorVisaCount: z.coerce.number().int().min(0).max(200).default(0),
    employeeVisaCount: z.coerce.number().int().min(0).max(200).default(0),
    familyVisaCount: z.coerce.number().int().min(0).max(200).default(0),
    officeType: z.enum(['none', 'flexi', 'physical', 'virtual']),
    officeAreaNotes: z.string().trim().max(1000).nullable().optional(),
    addOns: z.array(questionnaireAddOnSchema).default([]),
    documentReadiness: z.enum(['ready', 'partial', 'not_ready']),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((answers, ctx) => {
    if (answers.shareholderCount > 1 && !answers.shareholderSplitSummary?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['shareholderSplitSummary'],
        message: 'Shareholder split summary is required for multiple shareholders',
      });
    }
    if (answers.officeType !== 'none' && !answers.officeAreaNotes?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['officeAreaNotes'],
        message: 'Office area notes are required when office space is requested',
      });
    }
    if (!answers.email && !answers.phone) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Email or phone is required',
      });
    }
  });

export const estimateHandoffDataSchema = z
  .object({
    reference: z.string().trim().regex(/^EST-[A-Z0-9]{10}$/).optional(),
    jurisdiction: z.enum(['mainland', 'free_zone', 'offshore']).optional(),
    authority: z.string().trim().min(2).max(120).optional(),
    emirate: z.string().trim().min(2).max(80).optional(),
    activity: z.string().trim().min(1).max(80).optional(),
    shareholderCount: z.number().int().min(1).max(50).optional(),
    visaCount: z.number().int().min(0).max(200).optional(),
    legalStructure: z.enum(['llc', 'fz_llc', 'branch', 'offshore_company']).optional(),
    officeType: z.enum(['none', 'flexi', 'physical', 'virtual']).optional(),
    addOns: z.array(questionnaireAddOnSchema.exclude(['pro_services'])).max(3).optional(),
  })
  .strict();

export const questionnaireSubmissionSchema = z.object({
  answers: questionnaireAnswersSchema,
  estimateData: estimateHandoffDataSchema.nullable().default(null),
});

export type QuestionnaireAnswers = z.infer<typeof questionnaireAnswersSchema>;
export type QuestionnaireSubmission = z.infer<typeof questionnaireSubmissionSchema>;
export type QuestionnaireFieldId = keyof QuestionnaireAnswers;

export type QuestionnaireField = {
  id: QuestionnaireFieldId;
  step: 'personal' | 'business' | 'jurisdiction' | 'ownership' | 'visas' | 'office' | 'addons';
  label: string;
  visibleWhen?: (answers: Partial<QuestionnaireAnswers>) => boolean;
};

export const questionnaireFields: QuestionnaireField[] = [
  { id: 'fullName', step: 'personal', label: 'Full name' },
  { id: 'email', step: 'personal', label: 'Email' },
  { id: 'phone', step: 'personal', label: 'Phone' },
  { id: 'nationality', step: 'personal', label: 'Nationality' },
  { id: 'activity', step: 'business', label: 'Activity' },
  { id: 'preferredNames', step: 'business', label: 'Preferred names' },
  { id: 'businessSummary', step: 'business', label: 'Business summary' },
  { id: 'jurisdiction', step: 'jurisdiction', label: 'Jurisdiction' },
  { id: 'authority', step: 'jurisdiction', label: 'Authority' },
  { id: 'shareholderCount', step: 'ownership', label: 'Shareholder count' },
  {
    id: 'shareholderSplitSummary',
    step: 'ownership',
    label: 'Shareholder split',
    visibleWhen: (answers) => Number(answers.shareholderCount ?? 1) > 1,
  },
  {
    id: 'investorVisaCount',
    step: 'visas',
    label: 'Investor visas',
    visibleWhen: (answers) => requestedVisaCount(answers) > 0,
  },
  {
    id: 'employeeVisaCount',
    step: 'visas',
    label: 'Employee visas',
    visibleWhen: (answers) => requestedVisaCount(answers) > 0,
  },
  {
    id: 'familyVisaCount',
    step: 'visas',
    label: 'Family visas',
    visibleWhen: (answers) => requestedVisaCount(answers) > 0,
  },
  { id: 'officeType', step: 'office', label: 'Office type' },
  {
    id: 'officeAreaNotes',
    step: 'office',
    label: 'Office notes',
    visibleWhen: (answers) => answers.officeType !== undefined && answers.officeType !== 'none',
  },
  { id: 'addOns', step: 'addons', label: 'Add-ons' },
  { id: 'documentReadiness', step: 'addons', label: 'Document readiness' },
  { id: 'notes', step: 'addons', label: 'Notes' },
];

export function getVisibleQuestionnaireFields(
  answers: Partial<QuestionnaireAnswers>,
): QuestionnaireFieldId[] {
  return questionnaireFields
    .filter((field) => !field.visibleWhen || field.visibleWhen(answers))
    .map((field) => field.id);
}

export function normalizeEstimatorHandoff(params: URLSearchParams): {
  answers: Partial<QuestionnaireAnswers>;
  estimateData: Record<string, unknown>;
} {
  const visaCount = numberParam(params, 'visas') ?? 0;
  const addOns = (params.get('addons') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => questionnaireAddOnSchema.safeParse(value).success);

  const answers: Partial<QuestionnaireAnswers> = {
    jurisdiction: enumParam(params, 'jurisdiction', ['mainland', 'free_zone', 'offshore']),
    authority: textParam(params, 'authority'),
    activity: textParam(params, 'activity'),
    shareholderCount: numberParam(params, 'shareholders'),
    investorVisaCount: visaCount > 0 ? 1 : 0,
    employeeVisaCount: Math.max(0, visaCount - 1),
    familyVisaCount: 0,
    officeType: enumParam(params, 'office_type', ['none', 'flexi', 'physical', 'virtual']),
    addOns: addOns as QuestionnaireAnswers['addOns'],
  };

  const estimateData = {
    reference: textParam(params, 'estimate_ref'),
    jurisdiction: answers.jurisdiction,
    authority: answers.authority,
    emirate: textParam(params, 'emirate'),
    activity: answers.activity,
    shareholderCount: answers.shareholderCount,
    visaCount,
    legalStructure: textParam(params, 'legal_structure'),
    officeType: answers.officeType,
    addOns,
  };

  return {
    answers: compact(answers) as Partial<QuestionnaireAnswers>,
    estimateData: compact(estimateData),
  };
}

function requestedVisaCount(answers: Partial<QuestionnaireAnswers>): number {
  return (
    Number(answers.investorVisaCount ?? 0) +
    Number(answers.employeeVisaCount ?? 0) +
    Number(answers.familyVisaCount ?? 0)
  );
}

function textParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const value = Number(params.get(key));
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function enumParam<T extends string>(params: URLSearchParams, key: string, values: readonly T[]): T | undefined {
  const value = params.get(key);
  return values.includes(value as T) ? (value as T) : undefined;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
