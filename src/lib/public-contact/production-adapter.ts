import type { ContactAdapter } from './contracts';

export const productionContactAdapter: ContactAdapter = {
  async submit(contact) {
    try {
      const response = await fetch('/api/v1/public/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          turnstileToken: readTurnstileToken(),
          contact,
        }),
      });
      return (await response.json()) as Awaited<ReturnType<ContactAdapter['submit']>>;
    } catch {
      return {
        status: 'unavailable',
        sent: false,
        message: 'Contact intake is temporarily unavailable.',
      };
    }
  },
};

function readTurnstileToken(): string {
  const value = document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value;
  return value?.trim() || 'local-no-provider-token';
}

export const defaultContactAdapter = productionContactAdapter;
