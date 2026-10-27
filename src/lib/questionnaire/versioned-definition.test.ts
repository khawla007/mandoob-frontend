import assert from 'node:assert/strict';
import test from 'node:test';

import {
  questionnaireDefinitionSchema,
  validateQuestionnaireDefinition,
} from './versioned-definition';

const validDefinition = {
  key: 'company-setup',
  version: 1,
  sections: [
    {
      id: 'contact',
      title: 'Contact',
      order: 1,
      fields: [
        { id: 'email', type: 'email', label: 'Email', order: 1, required: true },
        {
          id: 'channel',
          type: 'select',
          label: 'Channel',
          order: 2,
          required: true,
          options: [
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone' },
          ],
        },
        {
          id: 'phone',
          type: 'phone',
          label: 'Phone',
          order: 3,
          required: true,
          visibleWhen: { fieldId: 'channel', operator: 'equals', value: 'phone' },
        },
        { id: 'consent', type: 'consent', label: 'I consent', order: 4, required: true },
      ],
    },
  ],
};

test('accepts a declarative versioned definition without executable expressions', () => {
  const parsed = questionnaireDefinitionSchema.parse(validDefinition);
  assert.equal(validateQuestionnaireDefinition(parsed).ok, true);
});

test('rejects dependency cycles and missing field references', () => {
  const cyclic = structuredClone(validDefinition);
  cyclic.sections[0].fields[0].visibleWhen = {
    fieldId: 'phone',
    operator: 'equals',
    value: 'x',
  };
  cyclic.sections[0].fields[2].visibleWhen = {
    fieldId: 'email',
    operator: 'equals',
    value: 'x',
  };
  const result = validateQuestionnaireDefinition(questionnaireDefinitionSchema.parse(cyclic));
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /cycle/i);

  const missing = structuredClone(validDefinition);
  missing.sections[0].fields[2].visibleWhen!.fieldId = 'absent';
  const missingResult = validateQuestionnaireDefinition(
    questionnaireDefinitionSchema.parse(missing),
  );
  assert.equal(missingResult.ok, false);
  assert.match(missingResult.issues.join(' '), /missing/i);
});

test('rejects hidden required fields without a visible required controller value', () => {
  const invalid = structuredClone(validDefinition);
  invalid.sections[0].fields[1].required = false;
  const result = validateQuestionnaireDefinition(questionnaireDefinitionSchema.parse(invalid));
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /hidden required/i);
});

test('rejects unsafe rich content and invalid conditional option values', () => {
  const unsafe = structuredClone(validDefinition);
  (unsafe.sections[0].fields[0] as { helpText?: string }).helpText = '<script>alert(1)</script>';
  assert.throws(() => questionnaireDefinitionSchema.parse(unsafe));

  const invalidOption = structuredClone(validDefinition);
  invalidOption.sections[0].fields[2].visibleWhen!.value = 'fax';
  const result = validateQuestionnaireDefinition(
    questionnaireDefinitionSchema.parse(invalidOption),
  );
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /option/i);
});
