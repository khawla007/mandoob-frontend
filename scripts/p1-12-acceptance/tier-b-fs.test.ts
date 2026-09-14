import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { assertP112NoSymlinkPath } from './tier-b-fs';

test('rejects symlink directory and file components', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'p112-safe-fs-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'p112-outside-'));
  await symlink(outside, path.join(root, 'linked-dir'));
  await assert.rejects(
    assertP112NoSymlinkPath(root, path.join(root, 'linked-dir', 'capture.png')),
    /symlink/u,
  );
  await mkdir(path.join(root, 'safe'));
  await symlink(path.join(outside, 'capture.png'), path.join(root, 'safe', 'capture.png'));
  await assert.rejects(
    assertP112NoSymlinkPath(root, path.join(root, 'safe', 'capture.png')),
    /symlink/u,
  );
});
