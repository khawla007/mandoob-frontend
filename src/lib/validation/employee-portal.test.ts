import { test } from 'node:test';
import assert from 'node:assert/strict';

type Mod = typeof import('./employee-portal');
let mod: Mod | null = null;
async function load(): Promise<Mod> {
  if (!mod) mod = await import('./employee-portal');
  return mod;
}

test('employeeNotificationPreferencesSchema accepts boolean reminder preference', async () => {
  const { employeeNotificationPreferencesSchema } = await load();
  const parsed = employeeNotificationPreferencesSchema.parse({
    renewal_reminders_enabled: false,
  });
  assert.deepEqual(parsed, { renewal_reminders_enabled: false });
});

test('employeeNotificationPreferencesSchema rejects non-boolean reminder preference', async () => {
  const { employeeNotificationPreferencesSchema } = await load();
  assert.equal(
    employeeNotificationPreferencesSchema.safeParse({
      renewal_reminders_enabled: 'yes',
    }).success,
    false,
  );
});
