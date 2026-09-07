import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

import { REGISTRATION_STAGE_CODES, VISA_MILESTONE_CODES } from '@/lib/registration/contracts';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('registration workspace render contracts run with the client React export', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

renderTest(
  'unavailable registration renders complete truthful geometry without synthetic progress',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RegistrationWorkspace } = await import('./RegistrationWorkspace');
    const html = renderToStaticMarkup(
      React.createElement(RegistrationWorkspace, {
        state: { kind: 'unavailable', reason: 'registration_contract_unavailable' },
        role: 'customer',
        locale: 'en-GB',
        labels: {
          stagesTitle: 'Registration stages',
          stagesDescription: 'Seven ordered stages',
          visaTitle: 'Visa processes',
          visaDescription: 'Each person progresses independently',
          blockerTitle: 'Current blocker',
          nextActionTitle: 'Next action',
          documentsTitle: 'Linked documents',
          historyTitle: 'Immutable history',
          unavailable: 'Source unavailable',
          unavailableDescription: 'Progress will appear after an approved source is connected.',
          actionUnavailable: 'Registration actions are unavailable.',
          empty: 'No registration exists.',
          partial: 'Some registration sources are unavailable.',
          noBlocker: 'No blocker recorded.',
          noNextAction: 'No next action recorded.',
          noDocuments: 'No linked documents.',
          noVisaPeople: 'No visa people.',
          noHistory: 'No history events.',
          stageCount: '{completed} of {total} stages complete',
          stageLabels: Object.fromEntries(
            REGISTRATION_STAGE_CODES.map((code) => [code, code]),
          ) as Record<(typeof REGISTRATION_STAGE_CODES)[number], string>,
          stageStatuses: {
            not_started: 'Upcoming',
            in_progress: 'Current',
            blocked: 'Blocked',
            completed: 'Completed',
            skipped: 'Skipped',
            unavailable: 'Unavailable',
          },
          visaLabels: Object.fromEntries(
            VISA_MILESTONE_CODES.map((code) => [code, code]),
          ) as Record<(typeof VISA_MILESTONE_CODES)[number], string>,
          visaStatuses: {
            not_started: 'Not started',
            active: 'Active',
            blocked: 'Blocked',
            completed: 'Completed',
            unavailable: 'Unavailable',
            cancelled: 'Cancelled',
          },
        },
      }),
    );

    assert.equal(html.match(/data-registration-stage=/gu)?.length, 7);
    assert.equal(html.match(/data-visa-milestone=/gu)?.length, 6);
    assert.match(html, /aria-label="Registration stages"/u);
    assert.match(html, /aria-label="Visa processes"/u);
    assert.match(html, /disabled=""/u);
    assert.doesNotMatch(html, /0%|sample|demo|mock/iu);
    assert.doesNotMatch(html, />\s*(Edit|Delete)\s*</iu);
    assert.doesNotMatch(html, /No blocker recorded|No next action recorded/u);
  },
);
