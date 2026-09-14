import type { ApplicationDefinition, ApplicationDraft } from './contracts';

export function applicationDocumentReadinessKeys(
  draft: ApplicationDraft,
  definition: ApplicationDefinition,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const rule of definition.documentRules) {
    if (rule.owner === 'each-shareholder') {
      for (const shareholder of draft.shareholders) {
        keys.add(`${rule.documentId}:${shareholder.id}`);
      }
    } else {
      keys.add(`${rule.documentId}:${rule.owner}`);
    }
  }
  return keys;
}
