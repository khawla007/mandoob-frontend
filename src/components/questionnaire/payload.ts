import {
  questionnaireSubmissionSchema,
  type QuestionnaireAnswers,
  type QuestionnaireSubmission,
} from '@/lib/questionnaire';

export type QuestionnaireFormAnswers = Omit<
  QuestionnaireAnswers,
  'email' | 'phone' | 'shareholderSplitSummary' | 'officeAreaNotes' | 'notes'
> & {
  email: string;
  phone: string;
  shareholderSplitSummary: string;
  officeAreaNotes: string;
  notes: string;
};

export type QuestionnaireFieldErrors = Partial<Record<keyof QuestionnaireAnswers | 'form', string>>;

type BuildResult =
  | { ok: true; submission: QuestionnaireSubmission; fieldErrors: QuestionnaireFieldErrors }
  | { ok: false; submission: null; fieldErrors: QuestionnaireFieldErrors };

export function createQuestionnaireDefaults(
  initialAnswers: Partial<QuestionnaireAnswers> = {},
): QuestionnaireFormAnswers {
  const defaults: QuestionnaireFormAnswers = {
    source: 'questionnaire',
    fullName: '',
    email: '',
    phone: '',
    nationality: '',
    activity: '',
    preferredNames: ['', '', ''],
    businessSummary: '',
    jurisdiction: 'free_zone',
    authority: '',
    shareholderCount: 1,
    shareholderSplitSummary: '',
    investorVisaCount: 0,
    employeeVisaCount: 0,
    familyVisaCount: 0,
    officeType: 'none',
    officeAreaNotes: '',
    addOns: [],
    documentReadiness: 'partial',
    notes: '',
  };

  return {
    ...defaults,
    ...initialAnswers,
    source: 'questionnaire',
    email: initialAnswers.email ?? '',
    phone: initialAnswers.phone ?? '',
    preferredNames: normalizePreferredNames(initialAnswers.preferredNames),
    shareholderSplitSummary: initialAnswers.shareholderSplitSummary ?? '',
    officeAreaNotes: initialAnswers.officeAreaNotes ?? '',
    notes: initialAnswers.notes ?? '',
    addOns: initialAnswers.addOns ?? [],
  };
}

export function buildQuestionnaireSubmission(
  answers: QuestionnaireFormAnswers,
  estimateData: Record<string, unknown>,
): BuildResult {
  const submission = {
    answers: {
      ...answers,
      email: emptyToNull(answers.email),
      phone: emptyToNull(answers.phone),
      preferredNames: answers.preferredNames.map((name) => name.trim()).filter(Boolean),
      shareholderSplitSummary: emptyToNull(answers.shareholderSplitSummary),
      officeAreaNotes: emptyToNull(answers.officeAreaNotes),
      notes: emptyToNull(answers.notes),
      shareholderCount: Number(answers.shareholderCount),
      investorVisaCount: Number(answers.investorVisaCount),
      employeeVisaCount: Number(answers.employeeVisaCount),
      familyVisaCount: Number(answers.familyVisaCount),
    },
    estimateData: Object.keys(estimateData).length ? estimateData : null,
  };

  const parsed = questionnaireSubmissionSchema.safeParse(submission);
  if (parsed.success) return { ok: true, submission: parsed.data, fieldErrors: {} };

  return {
    ok: false,
    submission: null,
    fieldErrors: parsed.error.issues.reduce<QuestionnaireFieldErrors>((acc, issue) => {
      const field = issue.path[0] === 'answers' ? issue.path[1] : issue.path[0];
      if (typeof field === 'string' && !(field in acc)) {
        acc[field as keyof QuestionnaireAnswers] = issue.message;
      }
      return acc;
    }, {}),
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePreferredNames(value: string[] | undefined): string[] {
  const names = value?.slice(0, 3) ?? [];
  while (names.length < 3) names.push('');
  return names;
}
