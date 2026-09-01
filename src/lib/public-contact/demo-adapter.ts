import type { ContactAdapter, ContactSubmissionResult } from './contracts';

export const SYNTHETIC_CONTACT_NOTICE = 'Synthetic contact preview only. No message was sent.';

export type SyntheticContactOutcome = ContactSubmissionResult['status'];

export const productionContactAdapter: ContactAdapter = {
  async submit() {
    return {
      status: 'unavailable',
      sent: false,
      message: 'Contact delivery is not available yet. No message was sent.',
    };
  },
};

export const defaultContactAdapter = productionContactAdapter;

export function createSyntheticContactAdapter(outcome: SyntheticContactOutcome): ContactAdapter {
  return {
    async submit() {
      return syntheticResult(outcome);
    },
  };
}

function syntheticResult(outcome: SyntheticContactOutcome): ContactSubmissionResult {
  const common = {
    sent: false,
    synthetic: true as const,
    notice: SYNTHETIC_CONTACT_NOTICE,
  };

  switch (outcome) {
    case 'success':
      return {
        ...common,
        status: 'success',
        message: 'Synthetic success preview only. No message was sent.',
      };
    case 'duplicate':
      return {
        ...common,
        status: 'duplicate',
        message: 'Synthetic duplicate preview only. No message was sent.',
      };
    case 'rate_limited':
      return {
        ...common,
        status: 'rate_limited',
        retryAfterSeconds: 60,
        message: 'Synthetic rate-limit preview only. No message was sent.',
      };
    case 'failure':
      return {
        ...common,
        status: 'failure',
        retryable: true,
        message: 'Synthetic failure preview only. No message was sent.',
      };
    case 'unavailable':
      return {
        ...common,
        status: 'unavailable',
        message: 'Synthetic unavailable preview only. No message was sent.',
      };
  }
}
