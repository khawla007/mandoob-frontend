import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { persistInvitedProfile } from './invited-profile';

type ProfileRow = {
  id: string;
  full_name: string;
  phone: string;
  status: 'invited';
  tenant_id: string | null;
  locale: 'en';
  role: 'pro';
};

const userId = '11111111-1111-4111-8111-111111111111';
const profile: ProfileRow = {
  id: userId,
  full_name: 'Acceptance Created PRO',
  phone: '+971501234569',
  status: 'invited',
  tenant_id: null,
  locale: 'en',
  role: 'pro',
};

function fakeDatabase(error: { code: string } | null = null) {
  const profiles = new Map<string, ProfileRow>();
  const calls: unknown[] = [];

  return {
    profiles,
    calls,
    client: {
      from(table: string) {
        assert.equal(table, 'profiles');
        return {
          async upsert(row: ProfileRow, options: { onConflict: string }) {
            calls.push({ row, options });
            if (!error) profiles.set(row.id, row);
            return { error };
          },
        };
      },
    },
    insertProProfile(profileId: string) {
      if (!profiles.has(profileId)) {
        const foreignKeyError = new Error('pro_profiles_profile_id_fkey');
        Object.assign(foreignKeyError, { code: '23503' });
        throw foreignKeyError;
      }
    },
  };
}

test('replaces a trigger-created profile with the authoritative invite payload', async () => {
  const db = fakeDatabase();
  db.profiles.set(userId, { ...profile, full_name: 'Stale trigger metadata' });

  await persistInvitedProfile(db.client as never, profile);

  assert.deepEqual(db.profiles.get(userId), profile);
});

test('persists the authoritative root profile before a role sub-row can reference it', async () => {
  const db = fakeDatabase();

  assert.throws(() => db.insertProProfile(userId), { code: '23503' });
  await persistInvitedProfile(db.client as never, profile);
  assert.doesNotThrow(() => db.insertProProfile(userId));
  assert.deepEqual(db.calls, [{ row: profile, options: { onConflict: 'id' } }]);
});

test('surfaces root profile persistence errors without creating a partial profile', async () => {
  const db = fakeDatabase({ code: '42501' });

  await assert.rejects(() => persistInvitedProfile(db.client as never, profile), {
    code: '42501',
  });
  assert.equal(db.profiles.size, 0);
});

test('admin creation persists the root profile before inserting any role sub-row', () => {
  const source = readFileSync('src/lib/data/admin-create-user.ts', 'utf8');
  const persistAt = source.indexOf('await persistInvitedProfile(');

  assert.ok(persistAt >= 0);
  for (const roleTable of ['pro_profiles', 'customer_profiles', 'employees']) {
    assert.ok(persistAt < source.indexOf(`from('${roleTable}').insert`), roleTable);
  }
  assert.doesNotMatch(source, /from\('profiles'\)[\s\S]*?\.update\(/u);
});
