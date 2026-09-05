import type {
  ApplicationDefinition,
  ApplicationDraft,
  ApplicationStepId,
  ApplicationStepStatus,
  ApplicationValidation,
  ApplicationValidationError,
} from './contracts';

export function validateApplication(
  draft: ApplicationDraft,
  definition: ApplicationDefinition,
): ApplicationValidation {
  const errors = definition.steps.flatMap((step) => errorsForStep(draft, step.id, definition));
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
  const errors = errorsForStep(draft, stepId, definition);
  const steps = Object.fromEntries(
    definition.steps.map((step) => [
      step.id,
      step.id === stepId ? (errors.length ? 'invalid' : 'complete') : 'incomplete',
    ]),
  ) as Record<ApplicationStepId, ApplicationStepStatus>;
  if (errors.length === 0) {
    return {
      status: 'valid',
      errors: [],
      firstInvalidControlId: null,
      steps: Object.fromEntries(definition.steps.map((step) => [step.id, 'complete'])) as Record<
        ApplicationStepId,
        'complete'
      >,
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
    if (draft.contact.fullName.trim().length < 2)
      add('application-full-name', 'Enter your full name.');
    if (draft.contact.nationality.trim().length < 2)
      add('application-nationality', 'Enter your nationality.');
    if (!validEmail(draft.contact.email) && !validPhone(draft.contact.phone))
      add('application-contact-channel', 'Enter a valid email address or phone number.', 'invalid');
  }

  if (stepId === 'business') {
    if (!definition.activities.some((item) => item.id === draft.business.activityId))
      add('application-activity', 'Choose an available business activity.');
    if (draft.business.preferredNames[0].trim().length < 2)
      add('application-company-name-1', 'Enter at least one preferred Company name.');
    if (draft.business.preferredNames.some((name) => name.length > 120))
      add('application-company-names', 'Company names must be 120 characters or fewer.', 'invalid');
    if (draft.business.summary.trim().length < 10 || draft.business.summary.length > 2_000)
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
    if (draft.setup.officeNotes.length > 1_000)
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
      const ownership = parseBasisPoints(row.ownershipBasisPoints);
      if (ownership === null) {
        everyOwnershipValid = false;
        add(
          `application-${row.id}-ownership`,
          'Enter ownership as integer basis points.',
          'invalid',
        );
      } else ownershipTotal += ownership;
    }
    if (everyOwnershipValid && ownershipTotal !== 10_000)
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

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function validPhone(value: string) {
  return value.length <= 32 && /^\+?[0-9 ()-]{7,32}$/u.test(value);
}

function parseWholeNumber(value: string) {
  if (!/^(0|[1-9]\d*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseBasisPoints(value: string) {
  const parsed = parseWholeNumber(value);
  return parsed !== null && parsed <= 10_000 ? parsed : null;
}
