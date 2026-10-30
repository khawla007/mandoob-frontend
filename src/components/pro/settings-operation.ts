export type SettingsOperation = { operation_id: string; expected_version: number };

/** Caller clears pending metadata on edit or success; ambiguous failures retain it. */
export function prepareSettingsOperation(
  pending: SettingsOperation | null,
  expectedVersion: number,
  createId: () => string,
): SettingsOperation {
  return pending ?? { operation_id: createId(), expected_version: expectedVersion };
}
