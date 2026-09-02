import type { ContactAdapter } from './contracts';

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
