import { z } from 'zod';

const SAFE_COPY =
  /^(?![\s\S]*(?:<\/?(?:script|iframe|object|embed|style)|javascript:|data:text\/html))[\s\S]*$/i;
const fieldIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
const safeCopySchema = z.string().trim().min(1).max(500).regex(SAFE_COPY);

export const QUESTIONNAIRE_FIELD_TYPES = [
  'text',
  'email',
  'phone',
  'number',
  'textarea',
  'select',
  'multi_select',
  'checkbox',
  'date',
  'file',
  'consent',
] as const;

const conditionSchema = z
  .object({
    fieldId: fieldIdSchema,
    operator: z.enum(['equals', 'not_equals', 'includes']),
    value: z.union([z.string().max(120), z.number().finite(), z.boolean()]),
  })
  .strict();

const optionSchema = z
  .object({ value: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), label: safeCopySchema })
  .strict();

const fieldSchema = z
  .object({
    id: fieldIdSchema,
    type: z.enum(QUESTIONNAIRE_FIELD_TYPES),
    label: safeCopySchema,
    helpText: safeCopySchema.optional(),
    order: z.number().int().min(1).max(1000),
    required: z.boolean().default(false),
    options: z.array(optionSchema).min(1).max(100).optional(),
    minLength: z.number().int().min(0).max(10000).optional(),
    maxLength: z.number().int().min(1).max(10000).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    visibleWhen: conditionSchema.optional(),
  })
  .strict();

export const questionnaireDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    version: z.number().int().positive(),
    sections: z
      .array(
        z
          .object({
            id: fieldIdSchema,
            title: safeCopySchema,
            description: safeCopySchema.optional(),
            order: z.number().int().min(1).max(1000),
            fields: z.array(fieldSchema).min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export type QuestionnaireDefinition = z.infer<typeof questionnaireDefinitionSchema>;
export type DefinitionValidation = { ok: true; issues: [] } | { ok: false; issues: string[] };

export function validateQuestionnaireDefinition(
  definition: QuestionnaireDefinition,
): DefinitionValidation {
  const issues: string[] = [];
  const fields = definition.sections.flatMap((section) => section.fields);
  const byId = new Map(fields.map((field) => [field.id, field]));

  if (byId.size !== fields.length) issues.push('Field identifiers must be unique.');
  if (
    new Set(definition.sections.map((section) => section.id)).size !== definition.sections.length
  ) {
    issues.push('Section identifiers must be unique.');
  }

  for (const field of fields) {
    const hasOptions = field.type === 'select' || field.type === 'multi_select';
    if (hasOptions !== Boolean(field.options?.length)) {
      issues.push(`Field ${field.id} has invalid options for its type.`);
    }
    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    ) {
      issues.push(`Field ${field.id} has an invalid length range.`);
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      issues.push(`Field ${field.id} has an invalid numeric range.`);
    }
    const condition = field.visibleWhen;
    if (!condition) continue;
    const controller = byId.get(condition.fieldId);
    if (!controller) {
      issues.push(`Field ${field.id} references missing field ${condition.fieldId}.`);
      continue;
    }
    if (field.required && !controller.required) {
      issues.push(`Hidden required field ${field.id} must depend on a required controller.`);
    }
    if (
      controller.options &&
      !controller.options.some((option) => option.value === condition.value)
    ) {
      issues.push(`Field ${field.id} uses an invalid controller option value.`);
    }
  }

  if (containsDependencyCycle(fields)) issues.push('Conditional field dependency cycle detected.');
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

function containsDependencyCycle(
  fields: QuestionnaireDefinition['sections'][number]['fields'],
): boolean {
  const dependencies = new Map(
    fields.map((field) => [field.id, field.visibleWhen ? [field.visibleWhen.fieldId] : []]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (dependencies.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return [...dependencies.keys()].some(visit);
}
