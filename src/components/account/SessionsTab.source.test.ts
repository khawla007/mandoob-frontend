import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('sessions tab authenticates before reading the service-backed session list', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/account/SessionsTab.tsx'),
    'utf8',
  );
  const auth = source.indexOf('await requireUser()');
  const sessions = source.indexOf('listUserSessions(session.id)');
  assert.ok(auth >= 0 && sessions > auth);
  assert.doesNotMatch(source, /SESSION_MANAGEMENT_UNAVAILABLE|sessionsUnavailable/u);
  assert.doesNotMatch(source, /catch\s*\{/u);
});

test('account sessions route retains its direct role authorization before rendering the tab', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/account/sessions/page.tsx'), 'utf8');
  const auth = source.indexOf('await requireUser()');
  const roleGuard = source.indexOf("session.role !== 'super_admin' && session.role !== 'pro'");
  const deny = source.indexOf('notFound()');
  const render = source.indexOf('<SessionsTab />');
  assert.ok(auth >= 0 && roleGuard > auth && deny > roleGuard && render > deny);
});
