import type {
  ApplicationDefinition,
  ApplicationDraft,
  ApplicationStepId,
  ApplicationStepStatus,
  ApplicationValidation,
  ApplicationValidationError,
  ApplicationCompletionInput,
  ApplicationConfirmationSummary,
} from './contracts';
import { getApplicationDefinitionSource } from './definition';
import { applicationDocumentReadinessKeys } from './document-readiness';

const validatedCompletions = new WeakSet<object>();

export function validateApplication(
  draft: ApplicationDraft,
  definition: ApplicationDefinition,
): ApplicationValidation {
  const errors = sortErrors(
    definition.steps.flatMap((step) => errorsForStep(draft, step.id, definition)),
    definition,
  );
  const steps = Object.fromEntries(
    definition.steps.map((step) => [
      step.id,
      errors.some((error) => error.stepId === step.id) ? 'invalid' : 'complete',
    ]),
  ) as Record<ApplicationStepId, ApplicationStepStatus>;
  if (errors.length === 0) {
    return {
      status: 'valid',
      errors: [],
      firstInvalidControlId: null,
      steps: steps as Record<ApplicationStepId, 'complete'>,
    };
  }
  return { status: 'invalid', errors, firstInvalidControlId: errors[0].fieldId, steps };
}

export function validateApplicationStep(
  draft: ApplicationDraft,
  stepId: ApplicationStepId,
  definition: ApplicationDefinition,
): ApplicationValidation {
  const currentIndex = definition.steps.findIndex((step) => step.id === stepId);
  const errors = sortErrors(
    definition.steps
      .slice(0, currentIndex + 1)
      .flatMap((step) => errorsForStep(draft, step.id, definition)),
    definition,
  );
  const steps = Object.fromEntries(
    definition.steps.map((step, index) => {
      if (index > currentIndex) return [step.id, 'incomplete'];
      const stepErrors = errorsForStep(draft, step.id, definition);
      return [step.id, stepErrors.length ? 'invalid' : 'complete'];
    }),
  ) as Record<ApplicationStepId, ApplicationStepStatus>;
  if (errors.length === 0) {
    return {
      status: 'valid',
      errors: [],
      firstInvalidControlId: null,
      steps,
    };
  }
  return { status: 'invalid', errors, firstInvalidControlId: errors[0].fieldId, steps };
}

function errorsForStep(
  draft: ApplicationDraft,
  stepId: ApplicationStepId,
  definition: ApplicationDefinition,
): ApplicationValidationError[] {
  const errors: ApplicationValidationError[] = [];
  const add = (
    fieldId: string,
    message: string,
    code: ApplicationValidationError['code'] = 'required',
  ) => errors.push({ stepId, fieldId, message, code, href: `#${fieldId}` });

  if (stepId === 'contact') {
    if (
      draft.contact.fullName.trim().length < definition.limits.nameMin ||
      draft.contact.fullName.length > definition.limits.nameMax
    )
      add('application-full-name', 'Enter your full name.');
    if (
      draft.contact.nationality.trim().length < definition.limits.nameMin ||
      draft.contact.nationality.length > definition.limits.nameMax
    )
      add('application-nationality', 'Enter your nationality.');
    if (draft.contact.email && !validEmail(draft.contact.email, definition.limits.emailMax))
      add('application-email', 'Enter a valid email address.', 'invalid');
    if (draft.contact.phone && !validPhone(draft.contact.phone, definition.limits.phoneMax))
      add('application-phone', 'Enter a valid phone number.', 'invalid');
    if (
      !validEmail(draft.contact.email, definition.limits.emailMax) &&
      !validPhone(draft.contact.phone, definition.limits.phoneMax)
    )
      add('application-contact-channel', 'Enter a valid email address or phone number.', 'invalid');
  }

  if (stepId === 'business') {
    if (!definition.activities.some((item) => item.id === draft.business.activityId))
      add('application-activity', 'Choose an available business activity.');
    if (draft.business.preferredNames[0].trim().length < definition.limits.nameMin)
      add('application-company-name-1', 'Enter at least one preferred Company name.');
    if (
      draft.business.preferredNames.some((name) => name.length > definition.limits.companyNameMax)
    )
      add('application-company-names', 'Company names must be 120 characters or fewer.', 'invalid');
    if (
      draft.business.summary.trim().length < definition.limits.businessSummaryMin ||
      draft.business.summary.length > definition.limits.businessSummaryMax
    )
      add(
        'application-business-summary',
        'Enter a business summary of 10 to 2,000 characters.',
        'invalid',
      );
  }

  if (stepId === 'setup') {
    const authority = definition.authorities.find(
      (item) =>
        item.id === draft.setup.authorityId && item.jurisdiction === draft.setup.jurisdiction,
    );
    if (!definition.jurisdictions.some((item) => item.id === draft.setup.jurisdiction))
      add('application-jurisdiction', 'Choose a jurisdiction.');
    if (!authority) add('application-authority', 'Choose a compatible authority.', 'incompatible');
    if (!authority?.activityIds.includes(draft.business.activityId ?? ''))
      add(
        'application-activity-compatibility',
        'Review the business activity for this authority.',
        'incompatible',
      );
    if (!authority?.legalStructureIds.includes(draft.setup.legalStructureId!))
      add('application-legal-structure', 'Choose a compatible legal structure.', 'incompatible');
    if (draft.visas.required === null)
      add('application-visas-required', 'Choose whether visas are required.');
    if (draft.visas.required) {
      const counts = [
        ['application-investor-visas', draft.visas.investorCount],
        ['application-employee-visas', draft.visas.employeeCount],
        ['application-family-visas', draft.visas.familyCount],
      ] as const;
      for (const [field, value] of counts) {
        if (parseWholeNumber(value) === null)
          add(field, 'Enter a whole number of visas.', 'invalid');
      }
      const parsed = counts.map(([, value]) => parseWholeNumber(value));
      if (
        parsed.every((value) => value !== null) &&
        authority &&
        parsed.reduce((sum, value) => sum + value!, 0) > authority.visaRange.max
      ) {
        add(
          'application-visa-total',
          `The selected authority supports up to ${authority.visaRange.max} visas.`,
          'incompatible',
        );
      }
    }
    if (!authority?.officeTypeIds.includes(draft.setup.officeTypeId!))
      add('application-office-type', 'Choose a compatible office option.', 'incompatible');
    if (draft.setup.officeNotes.length > definition.limits.officeNotesMax)
      add('application-office-notes', 'Office notes must be 1,000 characters or fewer.', 'invalid');
    if (draft.setup.addOnIds.some((id) => !authority?.addOnIds.includes(id)))
      add('application-add-ons', 'Review the selected additional services.', 'incompatible');
  }

  if (stepId === 'ownership') {
    const authority = definition.authorities.find((item) => item.id === draft.setup.authorityId);
    if (
      !authority ||
      draft.shareholders.length < authority.shareholderRange.min ||
      draft.shareholders.length > authority.shareholderRange.max
    ) {
      add('application-shareholder-count', 'Choose an allowed number of shareholders.', 'invalid');
    }
    let ownershipTotal = 0;
    let everyOwnershipValid = true;
    for (const row of draft.shareholders) {
      if (row.fullName.trim().length < 2)
        add(`application-${row.id}-full-name`, 'Enter the shareholder full name.');
      if (row.nationality.trim().length < 2)
        add(`application-${row.id}-nationality`, 'Enter the shareholder nationality.');
      const ownership = parseBasisPoints(
        row.ownershipBasisPoints,
        definition.limits.ownershipTotalBasisPoints,
      );
      if (ownership === null) {
        everyOwnershipValid = false;
        add(
          `application-${row.id}-ownership`,
          'Enter ownership as integer basis points.',
          'invalid',
        );
      } else ownershipTotal += ownership;
    }
    if (everyOwnershipValid && ownershipTotal !== definition.limits.ownershipTotalBasisPoints)
      add(
        'application-ownership-total',
        'Ownership must total exactly 100.00%.',
        'ownership-total',
      );
  }

  if (stepId === 'review') {
    if (!draft.confirmations.informationIsTrue)
      add('application-information-confirmation', 'Confirm that the information is accurate.');
    if (!draft.confirmations.dataProcessingConsent)
      add('application-data-consent', 'Consent to processing for this application preview.');
  }
  return errors;
}

export type ApplicationCompletionPreparation =
  | { status: 'ready'; value: ApplicationCompletionInput }
  | { status: 'invalid'; validation: ApplicationValidation }
  | { status: 'unavailable'; retryable: true; reason: 'invalid-definition' };

export function prepareApplicationCompletion(
  draft: ApplicationDraft,
  definition: ApplicationDefinition,
): ApplicationCompletionPreparation {
  if (getApplicationDefinitionSource(definition).status !== 'ready') {
    return { status: 'unavailable', retryable: true, reason: 'invalid-definition' };
  }
  const validation = validateApplication(draft, definition);
  if (validation.status === 'invalid') return { status: 'invalid', validation };
  const addOnIds = Object.freeze([...draft.setup.addOnIds]) as unknown as string[];
  const allowedDocumentKeys = applicationDocumentReadinessKeys(draft, definition);
  const summary = Object.freeze({
    jurisdiction: draft.setup.jurisdiction!,
    authorityId: draft.setup.authorityId!,
    activityId: draft.business.activityId!,
    legalStructureId: draft.setup.legalStructureId!,
    shareholderCount: draft.shareholders.length,
    visaCount:
      draft.visas.required === true
        ? Number(draft.visas.investorCount) +
          Number(draft.visas.employeeCount) +
          Number(draft.visas.familyCount)
        : 0,
    officeTypeId: draft.setup.officeTypeId!,
    addOnIds,
    readyDocumentCount: Object.entries(draft.documentReadiness).filter(
      ([key, value]) => allowedDocumentKeys.has(key) && value === 'ready',
    ).length,
  }) as ApplicationConfirmationSummary;
  const value = summary as ApplicationCompletionInput;
  validatedCompletions.add(value);
  return { status: 'ready', value };
}

export function isValidatedApplicationCompletion(input: ApplicationCompletionInput): boolean {
  return typeof input === 'object' && input !== null && validatedCompletions.has(input);
}

function validEmail(value: string, max: number) {
  return value.length <= max && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function validPhone(value: string, max: number) {
  if (value.length > max || !/^\+?[0-9 ()-]+$/u.test(value)) return false;
  const digitCount = value.replace(/\D/gu, '').length;
  return digitCount >= 7 && digitCount <= 15;
}

function parseWholeNumber(value: string) {
  if (!/^(0|[1-9]\d*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseBasisPoints(value: string, maximum: number) {
  const parsed = parseWholeNumber(value);
  return parsed !== null && parsed <= maximum ? parsed : null;
}

function sortErrors(
  errors: ApplicationValidationError[],
  definition: ApplicationDefinition,
): ApplicationValidationError[] {
  const ranks = new Map(definition.fields.map((field, index) => [field.id, index]));
  const rank = (fieldId: string) => {
    if (ranks.has(fieldId)) return ranks.get(fieldId)!;
    if (/^application-shareholder-\d+-full-name$/u.test(fieldId))
      return ranks.get('application-shareholder-full-name') ?? Number.MAX_SAFE_INTEGER;
    if (/^application-shareholder-\d+-nationality$/u.test(fieldId))
      return ranks.get('application-shareholder-nationality') ?? Number.MAX_SAFE_INTEGER;
    if (/^application-shareholder-\d+-ownership$/u.test(fieldId))
      return ranks.get('application-shareholder-ownership') ?? Number.MAX_SAFE_INTEGER;
    return Number.MAX_SAFE_INTEGER;
  };
  return [...errors].sort((left, right) => rank(left.fieldId) - rank(right.fieldId));
}
