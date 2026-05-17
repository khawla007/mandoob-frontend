export type LeadTemperature = 'hot' | 'warm' | 'cold';

export type LeadScoreFactor = {
  key: string;
  label: string;
  points: number;
};

export type LeadScoreResult = {
  score: number;
  temperature: LeadTemperature;
  factors: LeadScoreFactor[];
};

export type LeadScoringInput = {
  answers?: Record<string, unknown> | null;
  estimateData?: Record<string, unknown> | null;
};

const JURISDICTION_POINTS: Record<string, number> = {
  mainland: 15,
  free_zone: 12,
  offshore: 8,
};

const ADD_ON_POINTS: Record<string, number> = {
  bank_account: 5,
  tax_registration: 4,
  document_attestation: 3,
  pro_services: 3,
};

export function scoreLead(input: LeadScoringInput): LeadScoreResult {
  const answers = input.answers ?? {};
  const estimateData = input.estimateData ?? {};
  const factors: LeadScoreFactor[] = [{ key: 'base_intent', label: 'Base intent', points: 10 }];

  const contactPoints = (hasText(answers.email) ? 10 : 0) + (hasText(answers.phone) ? 10 : 0);
  if (contactPoints > 0) factors.push({ key: 'contactability', label: 'Contactability', points: contactPoints });

  const estimatePoints = hasText(estimateData.reference) || Object.keys(estimateData).length >= 4 ? 15 : 0;
  if (estimatePoints > 0) {
    factors.push({ key: 'estimator_engagement', label: 'Estimator engagement', points: estimatePoints });
  }

  const jurisdiction = stringValue(answers.jurisdiction) ?? stringValue(estimateData.jurisdiction);
  const jurisdictionPoints = jurisdiction ? JURISDICTION_POINTS[jurisdiction] ?? 0 : 0;
  if (jurisdictionPoints > 0) {
    factors.push({
      key: 'jurisdiction',
      label: String(jurisdiction).replaceAll('_', ' '),
      points: jurisdictionPoints,
    });
  }

  const visaPoints = Math.min(
    25,
    numberValue(answers.investorVisaCount) * 8 +
      numberValue(answers.employeeVisaCount) * 5 +
      numberValue(answers.familyVisaCount) * 2,
  );
  if (visaPoints > 0) factors.push({ key: 'visa_demand', label: 'Visa demand', points: visaPoints });

  const addOnPoints = Math.min(
    15,
    arrayValue(answers.addOns).reduce((total, addOn) => total + (ADD_ON_POINTS[addOn] ?? 2), 0),
  );
  if (addOnPoints > 0) factors.push({ key: 'add_ons', label: 'Add-ons', points: addOnPoints });

  const readiness = stringValue(answers.documentReadiness);
  const readinessPoints = readiness === 'ready' ? 10 : readiness === 'partial' ? 5 : 0;
  if (readinessPoints > 0) {
    factors.push({ key: 'document_readiness', label: 'Document readiness', points: readinessPoints });
  }

  const completenessPoints = completenessScore(answers);
  if (completenessPoints > 0) {
    factors.push({ key: 'completeness', label: 'Answer completeness', points: completenessPoints });
  }

  const score = clampScore(factors.reduce((total, factor) => total + factor.points, 0));
  return { score, temperature: scoreTemperatureFromScore(score), factors };
}

export function scoreTemperatureFromScore(score: number): LeadTemperature {
  if (score >= 75) return 'hot';
  if (score >= 45) return 'warm';
  return 'cold';
}

function completenessScore(answers: Record<string, unknown>): number {
  let score = 0;
  if ((stringValue(answers.businessSummary)?.length ?? 0) >= 80) score += 4;
  if (arrayValue(answers.preferredNames).length >= 3) score += 3;
  if ((stringValue(answers.notes)?.length ?? 0) >= 20) score += 3;
  return Math.min(score, 10);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringValue(value: unknown): string | null {
  return hasText(value) ? (value as string).trim() : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
