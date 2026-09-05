'use client';

import { useState } from 'react';

type NewsletterOutcome = 'success' | 'failure' | 'unavailable';
type NewsletterState = 'idle' | 'pending' | NewsletterOutcome;

export function validateNewsletterEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Enter an email address.';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? null : 'Enter a valid email address.';
}

export function resolveNewsletterOutcome(
  requested: NewsletterOutcome,
  production: boolean,
): NewsletterOutcome {
  return production ? 'unavailable' : requested;
}

export function KnowledgeBaseNewsletter({
  previewOutcome = 'unavailable',
}: {
  previewOutcome?: NewsletterOutcome;
}) {
  const [state, setState] = useState<NewsletterState>('idle');
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = event.currentTarget.elements.namedItem('email');
    const validation = validateNewsletterEmail(
      email instanceof HTMLInputElement ? email.value : '',
    );
    setError(validation);
    if (validation) return;
    setState('pending');
    queueMicrotask(() => {
      setState(resolveNewsletterOutcome(previewOutcome, process.env.NODE_ENV === 'production'));
    });
  }

  return (
    <form className="kb-newsletter" onSubmit={submit} noValidate>
      <div className="kb-newsletter__copy">
        <span className="kb-newsletter__icon" aria-hidden="true">
          @
        </span>
        <div>
          <h2 id="kb-newsletter-h">Review the newsletter demo</h2>
          <p>Validate the email control and delivery states without creating a subscription.</p>
        </div>
      </div>
      <div className="kb-newsletter__form">
        <label htmlFor="knowledge-newsletter-email">Email address</label>
        <div>
          <input
            id="knowledge-newsletter-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-describedby={`knowledge-newsletter-note${error ? ' knowledge-newsletter-error' : ''}`}
            aria-invalid={error ? 'true' : undefined}
          />
          <button className="btn btn--accent" type="submit" disabled={state === 'pending'}>
            {state === 'pending' ? 'Checking…' : state === 'failure' ? 'Retry preview' : 'Preview'}
          </button>
        </div>
        {error ? (
          <p id="knowledge-newsletter-error" className="field-error">
            {error}
          </p>
        ) : null}
        <p id="knowledge-newsletter-note" className="micro">
          This preview does not subscribe or store your email. Newsletter delivery is unavailable in
          this phase.
        </p>
        <p className="kb-newsletter__status" aria-live="polite">
          {state === 'pending' ? 'Checking the no-write preview.' : null}
          {state === 'success' ? 'Preview complete. No subscription was created.' : null}
          {state === 'failure' ? 'The preview failed. You can retry without sending data.' : null}
          {state === 'unavailable'
            ? 'Delivery remains unavailable; your address was not sent or stored.'
            : null}
        </p>
      </div>
    </form>
  );
}
