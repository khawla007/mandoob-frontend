import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const dalPath = join(process.cwd(), 'src/lib/data/admin-resync-role-metadata.ts');
const routePath = join(process.cwd(), 'src/app/api/v1/admin/users/[id]/role/resync/route.ts');
const buttonPath = join(process.cwd(), 'src/components/admin/ResyncRoleMetadataButton.tsx');
const dal = existsSync(dalPath) ? readFileSync(dalPath, 'utf8') : '';
const route = existsSync(routePath) ? readFileSync(routePath, 'utf8') : '';
const button = existsSync(buttonPath) ? readFileSync(buttonPath, 'utf8') : '';
const roleRoute = readFileSync(
  join(process.cwd(), 'src/app/api/v1/admin/users/[id]/role/route.ts'),
  'utf8',
);

test('metadata resync is platform-admin scoped and sources canonical claims from the database', () => {
  assert.ok(existsSync(dalPath), 'metadata resync DAL must exist');
  assert.match(dal, /export async function resyncUserRoleMetadata/);
  assert.match(dal, /caller\.role !== 'super_admin' && caller\.role !== 'admin'/);
  assert.match(dal, /caller\.id === targetUserId/);
  assert.match(dal, /\.select\('id, role, tenant_id, status'\)/);
  assert.match(dal, /assertAdminCanModifyTarget/);
  assert.match(dal, /auth\.admin\.getUserById\(targetUserId\)/);
  assert.match(
    dal,
    /isRoleMetadataResyncSourceSafe\(authUser\.user\.app_metadata, currentClaims\)/,
  );
  assert.match(dal, /ROLE_METADATA_STATE_CONFLICT/);
  assert.match(dal, /mandoob_role: profile\.role/);
  assert.match(dal, /tenant_id: profile\.tenant_id/);
  assert.match(dal, /mandoob_status: profile\.status/);
  assert.match(dal, /mandoob_role_transition: null/);
  assert.doesNotMatch(dal, /newRole|newTenantId/);
});

test('metadata resync uses the fail-closed executor and an existing audit action', () => {
  assert.match(dal, /await executeRoleMetadataResync\(/);
  assert.match(dal, /revoke: \(\) => revokeAllSessions\(targetUserId\)/);
  assert.match(dal, /app_metadata: claims/);
  assert.match(dal, /action: 'change_role'/);
  assert.doesNotMatch(dal, /role_metadata_resync['"]/);
});

test('metadata resync has an AAL2 admin endpoint and explicit admin control', () => {
  assert.ok(existsSync(routePath), 'metadata resync endpoint must exist');
  assert.ok(existsSync(buttonPath), 'metadata resync admin control must exist');
  assert.match(route, /requireRole\('super_admin', 'admin'\)/);
  assert.match(route, /session\.aal !== 'aal2'/);
  assert.match(route, /await resyncUserRoleMetadata\(/);
  assert.match(button, /\/role\/resync/);
  assert.match(button, /roleChange\.resync/);
  assert.match(roleRoute, /await adminChangeRole/);
  assert.doesNotMatch(roleRoute, /resyncUserRoleMetadata/);
});
