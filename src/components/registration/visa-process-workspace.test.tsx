import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

import { VISA_MILESTONE_CODES, type VisaMilestoneCode } from '@/lib/registration/contracts';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;
if (reactServer) {
  test('visa workspace render contract runs with client React exports', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

renderTest(
  'Employee unavailable visa state keeps all private workflow regions without Company stages',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { VisaProcessWorkspace } = await import('./VisaProcessWorkspace');
    const html = renderToStaticMarkup(
      React.createElement(VisaProcessWorkspace, {
        state: { kind: 'unavailable', reason: 'visa_contract_unavailable' },
        labels: {
          title: 'My visa process',
          description: 'Private workflow',
          unavailable: 'Source unavailable',
          blocker: 'Current blocker',
          nextAction: 'Next action',
          documents: 'Requirements and documents',
          history: 'History',
          milestones: Object.fromEntries(
            VISA_MILESTONE_CODES.map((code) => [code, code]),
          ) as Record<VisaMilestoneCode, string>,
        },
      }),
    );
    assert.equal(html.match(/data-visa-milestone=/gu)?.length, 6);
    for (const region of ['blocker', 'next-action', 'documents', 'history'])
      assert.match(html, new RegExp(`data-visa-region="${region}"`, 'u'));
    assert.doesNotMatch(html, /data-registration-stage|Company registration|<form/iu);
  },
);
