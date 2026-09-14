import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('sessions tab authenticates before its narrowly classified dependency recovery', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/account/SessionsTab.tsx'),
    'utf8',
  );
  const auth = source.indexOf('await requireUser()');
  const recovery = source.indexOf('try {');
  const sessions = source.indexOf('await listUserSessions(session.id)');
  assert.ok(auth >= 0 && recovery > auth && sessions > recovery);
  assert.match(source, /isSessionManagementUnavailableError\(error\)/u);
  assert.match(source, /if \(!isSessionManagementUnavailableError\(error\)\) throw error/u);
  assert.doesNotMatch(source, /catch\s*\{\s*return/u);
});

test('account sessions route retains its direct role authorization before rendering the tab', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/account/sessions/page.tsx'), 'utf8');
  const auth = source.indexOf('await requireUser()');
  const roleGuard = source.indexOf("session.role !== 'super_admin' && session.role !== 'pro'");
  const deny = source.indexOf('notFound()');
  const render = source.indexOf('<SessionsTab />');
  assert.ok(auth >= 0 && roleGuard > auth && deny > roleGuard && render > deny);
});
