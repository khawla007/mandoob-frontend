import assert from 'node:assert/strict';
import test from 'node:test';

import { findP112ThemeRoleMismatches } from './theme';

test('compares semantic roles across themes without confusing a reversed neutral ramp', () => {
  const mismatches = findP112ThemeRoleMismatches(
    {
      canvas: 'light-canvas',
      surface: 'shared-ramp',
      elevated: 'light-canvas',
      text: 'light-text',
      muted: 'light-muted',
      tint: 'light-tint',
      body: 'light-body',
    },
    {
      canvas: 'dark-canvas',
      surface: 'dark-surface',
      elevated: 'shared-ramp',
      text: 'shared-ramp',
      muted: 'dark-muted',
      tint: 'dark-tint',
      body: 'dark-body',
    },
    [{ identity: '.site-public', background: 'light-canvas', color: 'shared-ramp' }],
    [{ identity: '.site-public', background: 'dark-canvas', color: 'shared-ramp' }],
  );
  assert.deepEqual(mismatches, []);
});

test('reports a surface that fails to follow its semantic role', () => {
  assert.deepEqual(
    findP112ThemeRoleMismatches(
      {
        canvas: 'light-canvas',
        surface: 'light-surface',
        elevated: 'light-raised',
        text: 'light-text',
        muted: 'light-muted',
        tint: 'light-tint',
        body: 'light-body',
      },
      {
        canvas: 'dark-canvas',
        surface: 'dark-surface',
        elevated: 'dark-raised',
        text: 'dark-text',
        muted: 'dark-muted',
        tint: 'dark-tint',
        body: 'dark-body',
      },
      [{ identity: 'main', background: 'light-canvas', color: 'light-text' }],
      [{ identity: 'main', background: 'light-canvas', color: 'dark-text' }],
    ),
    ['main:background'],
  );
});
