import type { ReactNode } from 'react';

type Params = { slug: string };

type LegalDoc = {
  title: string;
  eyebrow: string;
  updated: string;
  body: ReactNode;
};

const UPDATED = 'Last updated: 22 May 2026';

const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: 'Privacy Policy',
    eyebrow: 'Legal · Privacy',
    updated: UPDATED,
    body: (
      <>
        <p>
          This Privacy Policy explains how Mandoob, operated by Fanatic Coders (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;), collects, uses, and protects personal data when you use our UAE
          business registration and PRO management platform. We process personal data in line with
          the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021).
        </p>
        <h2>Data we collect</h2>
        <ul>
          <li>Account data: name, email, phone number, and role.</li>
          <li>Business data: company details, licenses, and documents you upload.</li>
          <li>
            Identity data needed for government processes: passport, Emirates ID, and visa details.
          </li>
          <li>Usage data: log records, device information, and audit-trail events.</li>
        </ul>
        <h2>How we use data</h2>
        <p>
          We use personal data to provide the service, process registrations and renewals,
          communicate with you, meet legal and regulatory obligations, and maintain security and an
          auditable record of actions.
        </p>
        <h2>Storage and security</h2>
        <p>
          Data is hosted in the nearest Middle East region with encryption in transit (TLS 1.3) and
          at rest. Sensitive identity fields are encrypted at the application layer. Access is
          restricted by role and isolated per tenant.
        </p>
        <h2>Your rights</h2>
        <p>
          Subject to PDPL, you may request access, correction, or erasure of your personal data, and
          may withdraw consent. To exercise these rights, contact us at privacy@mandoob.ae.
        </p>
        <h2>Contact</h2>
        <p>For privacy questions, email privacy@mandoob.ae.</p>
      </>
    ),
  },
  terms: {
    title: 'Terms & Conditions',
    eyebrow: 'Legal · Terms',
    updated: UPDATED,
    body: (
      <>
        <p>
          These Terms govern your access to and use of the Mandoob platform. By creating an account
          or using the service, you agree to these Terms.
        </p>
        <h2>The service</h2>
        <p>
          Mandoob provides software for UAE company registration, PRO operations, document
          management, renewals, and related workflows. Government fees and third-party charges are
          separate from any platform subscription.
        </p>
        <h2>Accounts and roles</h2>
        <p>
          You are responsible for the accuracy of information you provide and for safeguarding your
          credentials. Access is governed by your assigned role and tenant.
        </p>
        <h2>Subscriptions and fees</h2>
        <p>
          PRO subscriptions are billed monthly or annually per the plan selected. Per-transaction
          fees may apply to direct registrations. Fees are non-refundable except where required by
          law.
        </p>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not misuse the platform or attempt to access data outside your tenant.</li>
          <li>Do not upload unlawful content or violate applicable UAE regulations.</li>
        </ul>
        <h2>Liability</h2>
        <p>
          The service is provided on an &ldquo;as is&rdquo; basis. To the extent permitted by law,
          we are not liable for indirect or consequential losses. Nothing limits liability that
          cannot be excluded under UAE law.
        </p>
        <h2>Contact</h2>
        <p>For questions about these Terms, email legal@mandoob.ae.</p>
      </>
    ),
  },
  pdpl: {
    title: 'PDPL Statement',
    eyebrow: 'Legal · PDPL',
    updated: UPDATED,
    body: (
      <>
        <p>
          Mandoob processes personal data in accordance with the UAE Personal Data Protection Law
          (Federal Decree-Law No. 45 of 2021). We support consent tracking, data-processing
          agreements per tenant, and the right to erasure.
        </p>
        <h2>Data residency</h2>
        <p>
          Data is hosted in the nearest Middle East region, with an architecture able to migrate to
          UAE-hosted infrastructure should regulation require it.
        </p>
        <h2>Requests</h2>
        <p>To raise a PDPL request, email privacy@mandoob.ae.</p>
      </>
    ),
  },
  trust: {
    title: 'Trust Center',
    eyebrow: 'Legal · Trust',
    updated: UPDATED,
    body: (
      <>
        <p>
          Security is foundational to Mandoob. We enforce role-based access, per-tenant isolation
          via Postgres row-level security, encryption in transit and at rest, and a complete audit
          trail of mutating actions.
        </p>
        <h2>Certifications</h2>
        <p>PDPL aligned · ISO 27001 · TLS 1.3 · SOC 2 in progress.</p>
        <h2>Reporting</h2>
        <p>Report a security concern to security@mandoob.ae.</p>
      </>
    ),
  },
};

export default async function LegalPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const doc = DOCS[slug];

  const title = doc?.title ?? slug.replace(/-/g, ' ');
  const eyebrow = doc?.eyebrow ?? 'Legal';

  return (
    <section className="section" aria-labelledby="legal-h">
      <div className="container">
        <header className="section__head">
          <span className="eyebrow">{eyebrow}</span>
          <h1 id="legal-h" className="h2" style={{ textTransform: 'capitalize' }}>
            {title}
          </h1>
        </header>
        <div className="prose-doc">
          {doc ? (
            <>
              <p className="doc-updated mono">{doc.updated}</p>
              {doc.body}
            </>
          ) : (
            <p>This document is not yet available.</p>
          )}
        </div>
      </div>
    </section>
  );
}
