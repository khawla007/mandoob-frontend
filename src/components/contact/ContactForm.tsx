'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import {
  CONTACT_LIMITS,
  CONTACT_SUBJECTS,
  type ContactAdapter,
  type ContactFieldError,
  type ContactFieldName,
  type ContactSubmissionResult,
} from '@/lib/public-contact/contracts';
import { type SyntheticContactOutcome } from '@/lib/public-contact/demo-adapter';
import { productionContactAdapter } from '@/lib/public-contact/production-adapter';
import { validateContactSubmission } from '@/lib/public-contact/validation';

type ContactFormProps = {
  demoOutcome?: SyntheticContactOutcome;
  demoDelayMs?: number;
};

type ContactValues = {
  fullName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  consent: boolean;
};

const INITIAL_VALUES: ContactValues = {
  fullName: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
  consent: false,
};

const SUBJECT_LABELS: Record<(typeof CONTACT_SUBJECTS)[number], string> = {
  company_setup: 'Company setup',
  cost_estimate: 'Cost estimate',
  document_requirements: 'Document requirements',
  visa_immigration: 'Visa and immigration guidance',
  banking_guidance: 'Banking requirements guidance',
  license_renewal: 'Licence renewal',
  other: 'Other',
};

const RESULT_HEADINGS: Record<ContactSubmissionResult['status'], string> = {
  success: 'Message preview complete',
  duplicate: 'Duplicate message detected',
  rate_limited: 'Please wait before trying again',
  failure: 'We could not process this message',
  unavailable: 'Message delivery is unavailable',
};

export function ContactForm({ demoOutcome, demoDelayMs = 0 }: ContactFormProps) {
  const developmentDemo = process.env.NODE_ENV === 'development' && demoOutcome;
  const adapter = developmentDemo
    ? createDevelopmentContactAdapter(developmentDemo)
    : productionContactAdapter;

  return <ContactFormRuntime adapter={adapter} delayMs={developmentDemo ? demoDelayMs : 0} />;
}

function createDevelopmentContactAdapter(outcome: SyntheticContactOutcome): ContactAdapter {
  return {
    async submit(payload) {
      if (process.env.NODE_ENV !== 'development') {
        return productionContactAdapter.submit(payload);
      }
      const { createSyntheticContactAdapter } = await import('@/lib/public-contact/demo-adapter');
      return createSyntheticContactAdapter(outcome).submit(payload);
    },
  };
}

/** Client-test seam. Never pass adapter functions across a Server Component boundary. */
export function ContactFormTestHarness({
  adapter,
  delayMs = 0,
  onResultCommitted,
}: {
  adapter: ContactAdapter;
  delayMs?: number;
  onResultCommitted?: (result: ContactSubmissionResult) => void;
}) {
  return (
    <ContactFormRuntime adapter={adapter} delayMs={delayMs} onResultCommitted={onResultCommitted} />
  );
}

function ContactFormRuntime({
  adapter,
  delayMs,
  onResultCommitted,
}: {
  adapter: ContactAdapter;
  delayMs: number;
  onResultCommitted?: (result: ContactSubmissionResult) => void;
}) {
  const [values, setValues] = useState<ContactValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<ContactFieldError[]>([]);
  const [invalidAttempt, setInvalidAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ContactSubmissionResult | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const summaryRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (invalidAttempt > 0) summaryRef.current?.focus();
  }, [invalidAttempt]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const errorFor = (field: ContactFieldName) => errors.find((error) => error.field === field);
  const describedBy = (field: ContactFieldName, cueId?: string) =>
    [cueId, errorFor(field) ? `contact-${field}-error` : null].filter(Boolean).join(' ') ||
    undefined;

  const updateValue = <Field extends keyof ContactValues>(
    field: Field,
    value: ContactValues[Field],
  ) => {
    if (pendingRef.current) return;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => current.filter((error) => error.field !== field));
    setResult(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;

    const formData = new FormData(event.currentTarget);
    const validation = validateContactSubmission({
      fullName: String(formData.get('fullName') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      subject: String(formData.get('subject') ?? ''),
      message: String(formData.get('message') ?? ''),
      consent: formData.get('consent') === 'on',
    });

    if (!validation.ok) {
      setResult(null);
      setErrors(validation.errors);
      setInvalidAttempt((attempt) => attempt + 1);
      return;
    }

    setErrors([]);
    pendingRef.current = true;
    setPending(true);
    try {
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
      if (!mountedRef.current) return;
      const nextResult = await adapter.submit(validation.data);
      if (mountedRef.current) {
        setResult(nextResult);
        onResultCommitted?.(nextResult);
      }
    } catch {
      if (mountedRef.current) {
        const failure: ContactSubmissionResult = {
          status: 'failure',
          sent: false,
          retryable: true,
          message: 'Message delivery could not be completed. No message was sent.',
        };
        setResult(failure);
        onResultCommitted?.(failure);
      }
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  };

  const resetForm = () => {
    setValues(INITIAL_VALUES);
    setErrors([]);
    setResult(null);
    fullNameRef.current?.focus();
  };

  const retry = () => {
    setErrors([]);
    setResult(null);
    submitRef.current?.focus();
  };

  const focusErrorField = (field: ContactFieldName) => {
    document.getElementById(`contact-${field}`)?.focus();
  };

  return (
    <form className="contact-form" noValidate onSubmit={handleSubmit}>
      <div className="contact-form__intro">
        <p className="eyebrow">Send Us a Message</p>
        <h2>Tell us how we can help</h2>
        <p>All fields are required. Phase 1 previews do not send messages.</p>
      </div>

      {errors.length > 0 ? (
        <div
          ref={summaryRef}
          id="contact-error-summary"
          className="contact-form__error-summary"
          role="alert"
          tabIndex={-1}
        >
          <h3>Check the highlighted fields</h3>
          <ul>
            {errors.map((error) => (
              <li key={error.field}>
                <a
                  href={error.href}
                  onClick={(event) => {
                    event.preventDefault();
                    focusErrorField(error.field);
                  }}
                >
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="contact-form__grid">
        <FieldShell error={errorFor('fullName')} field="fullName" label="Full name">
          <input
            ref={fullNameRef}
            id="contact-fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            maxLength={CONTACT_LIMITS.fullNameMax}
            required
            disabled={pending}
            value={values.fullName}
            aria-invalid={Boolean(errorFor('fullName'))}
            aria-describedby={describedBy('fullName')}
            onChange={(event) => updateValue('fullName', event.target.value)}
          />
        </FieldShell>

        <FieldShell error={errorFor('email')} field="email" label="Email address">
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={CONTACT_LIMITS.emailMax}
            required
            disabled={pending}
            value={values.email}
            aria-invalid={Boolean(errorFor('email'))}
            aria-describedby={describedBy('email')}
            onChange={(event) => updateValue('email', event.target.value)}
          />
        </FieldShell>

        <FieldShell
          error={errorFor('phone')}
          field="phone"
          label="UAE phone number"
          cue="Use a UAE mobile or landline number."
        >
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={CONTACT_LIMITS.phoneMax}
            required
            disabled={pending}
            value={values.phone}
            aria-invalid={Boolean(errorFor('phone'))}
            aria-describedby={describedBy('phone', 'contact-phone-cue')}
            onChange={(event) => updateValue('phone', event.target.value)}
          />
        </FieldShell>

        <FieldShell error={errorFor('subject')} field="subject" label="How can we help?">
          <select
            id="contact-subject"
            name="subject"
            required
            disabled={pending}
            value={values.subject}
            aria-invalid={Boolean(errorFor('subject'))}
            aria-describedby={describedBy('subject')}
            onChange={(event) => updateValue('subject', event.target.value)}
          >
            <option value="">Choose a subject</option>
            {CONTACT_SUBJECTS.map((subject) => (
              <option key={subject} value={subject}>
                {SUBJECT_LABELS[subject]}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell
          className="contact-form__field--wide"
          error={errorFor('message')}
          field="message"
          label="Message"
          cue={`${CONTACT_LIMITS.messageMin}–${CONTACT_LIMITS.messageMax} characters.`}
        >
          <textarea
            id="contact-message"
            name="message"
            rows={4}
            maxLength={CONTACT_LIMITS.messageMax}
            required
            disabled={pending}
            value={values.message}
            aria-invalid={Boolean(errorFor('message'))}
            aria-describedby={describedBy('message', 'contact-message-cue')}
            onChange={(event) => updateValue('message', event.target.value)}
          />
        </FieldShell>
      </div>

      <div className="contact-form__consent">
        <input
          id="contact-consent"
          name="consent"
          type="checkbox"
          required
          disabled={pending}
          checked={values.consent}
          aria-invalid={Boolean(errorFor('consent'))}
          aria-describedby={describedBy('consent')}
          onChange={(event) => updateValue('consent', event.target.checked)}
        />
        <div>
          <label htmlFor="contact-consent">
            I agree that Mandoob may use these details to respond, as described in the{' '}
            <Link href="/legal/privacy" prefetch={false}>
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link href="/legal/terms" prefetch={false}>
              Terms of Service
            </Link>
            .
          </label>
          <InlineError error={errorFor('consent')} />
        </div>
      </div>

      {pending ? (
        <p className="contact-form__pending" role="status" aria-live="polite">
          Preparing this no-send preview… No message has been sent.
        </p>
      ) : null}

      {result ? (
        <div
          ref={resultRef}
          className={`contact-form__result contact-form__result--${result.status}`}
          data-contact-result={result.status}
          role="status"
          tabIndex={-1}
        >
          <h3>{RESULT_HEADINGS[result.status]}</h3>
          <p>{result.message}</p>
          <p className="contact-form__delivery">
            Delivery status: {result.sent ? 'A message was sent.' : 'No message was sent.'}
          </p>
          {result.status === 'rate_limited' ? (
            <p>Try again in about {result.retryAfterSeconds} seconds.</p>
          ) : null}
          {result.synthetic ? <p className="contact-form__notice">{result.notice}</p> : null}
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={result.status === 'success' ? resetForm : retry}
          >
            {result.status === 'success' ? 'Start another message' : 'Review and try again'}
          </button>
        </div>
      ) : null}

      <div className="contact-form__actions">
        <button
          ref={submitRef}
          type="submit"
          className="btn btn--accent"
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? 'Preparing preview…' : 'Send message'}
        </button>
        <button type="button" className="btn btn--outline" disabled={pending} onClick={resetForm}>
          Reset
        </button>
      </div>
    </form>
  );
}

function FieldShell({
  children,
  className = '',
  cue,
  error,
  field,
  label,
}: {
  children: ReactNode;
  className?: string;
  cue?: string;
  error?: ContactFieldError;
  field: Exclude<ContactFieldName, 'consent'>;
  label: string;
}) {
  return (
    <div className={`contact-form__field ${className}`.trim()}>
      <label htmlFor={`contact-${field}`}>{label}</label>
      {children}
      {cue ? (
        <p id={`contact-${field}-cue`} className="contact-form__cue">
          {cue}
        </p>
      ) : null}
      <InlineError error={error} />
    </div>
  );
}

function InlineError({ error }: { error?: ContactFieldError }) {
  return error ? (
    <p id={`contact-${error.field}-error`} className="contact-form__field-error">
      {error.message}
    </p>
  ) : null;
}
