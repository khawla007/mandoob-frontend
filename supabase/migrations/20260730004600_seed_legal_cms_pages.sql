-- Move the four platform legal documents into the shared CMS page editor.

insert into public.cms_pages (
  slug,
  title,
  content_json,
  content_html,
  status,
  published_at,
  scheduled_for,
  hero_settings,
  meta_title,
  meta_description,
  canonical_url,
  noindex,
  schema_markup
)
values
  (
    'privacy',
    'Privacy Policy',
    $json${
      "type": "doc",
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "Last updated: 22 May 2026" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "This Privacy Policy explains how Mandoob, operated by Fanatic Coders (\"we\", \"us\"), collects, uses, and protects personal data when you use our UAE business registration and PRO management platform. We process personal data in line with the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021)." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Data we collect" }] },
        { "type": "bulletList", "content": [
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Account data: name, email, phone number, and role." }] }] },
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Business data: company details, licenses, and documents you upload." }] }] },
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Identity data needed for government processes: passport, Emirates ID, and visa details." }] }] },
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Usage data: log records, device information, and audit-trail events." }] }] }
        ] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "How we use data" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "We use personal data to provide the service, process registrations and renewals, communicate with you, meet legal and regulatory obligations, and maintain security and an auditable record of actions." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Storage and security" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "Data is hosted in the nearest Middle East region with encryption in transit (TLS 1.3) and at rest. Sensitive identity fields are encrypted at the application layer. Access is restricted by role and isolated per tenant." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Your rights" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "Subject to PDPL, you may request access, correction, or erasure of your personal data, and may withdraw consent. To exercise these rights, contact us at privacy@mandoob.ae." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Contact" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "For privacy questions, email privacy@mandoob.ae." }] }
      ]
    }$json$::jsonb,
    $html$<p>Last updated: 22 May 2026</p>
<p>This Privacy Policy explains how Mandoob, operated by Fanatic Coders (&ldquo;we&rdquo;, &ldquo;us&rdquo;), collects, uses, and protects personal data when you use our UAE business registration and PRO management platform. We process personal data in line with the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021).</p>
<h2>Data we collect</h2>
<ul><li><p>Account data: name, email, phone number, and role.</p></li><li><p>Business data: company details, licenses, and documents you upload.</p></li><li><p>Identity data needed for government processes: passport, Emirates ID, and visa details.</p></li><li><p>Usage data: log records, device information, and audit-trail events.</p></li></ul>
<h2>How we use data</h2>
<p>We use personal data to provide the service, process registrations and renewals, communicate with you, meet legal and regulatory obligations, and maintain security and an auditable record of actions.</p>
<h2>Storage and security</h2>
<p>Data is hosted in the nearest Middle East region with encryption in transit (TLS 1.3) and at rest. Sensitive identity fields are encrypted at the application layer. Access is restricted by role and isolated per tenant.</p>
<h2>Your rights</h2>
<p>Subject to PDPL, you may request access, correction, or erasure of your personal data, and may withdraw consent. To exercise these rights, contact us at privacy@mandoob.ae.</p>
<h2>Contact</h2>
<p>For privacy questions, email privacy@mandoob.ae.</p>$html$,
    'published',
    '2026-05-22T00:00:00Z',
    null,
    '{"backgroundColor": "#ffffff", "overlayColor": "#000000", "overlayOpacity": 0, "headingAlignment": "center", "textAlignment": "center", "buttonAlignment": "center"}'::jsonb,
    'Privacy Policy',
    'How Mandoob collects, uses, stores, and protects personal data under the UAE PDPL.',
    'https://mandoob.ae/legal/privacy',
    false,
    '{}'::jsonb
  ),
  (
    'terms',
    'Terms & Conditions',
    $json${
      "type": "doc",
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "Last updated: 22 May 2026" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "These Terms govern your access to and use of the Mandoob platform. By creating an account or using the service, you agree to these Terms." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "The service" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "Mandoob provides software for UAE company registration, PRO operations, document management, renewals, and related workflows. Government fees and third-party charges are separate from any platform subscription." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Accounts and roles" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "You are responsible for the accuracy of information you provide and for safeguarding your credentials. Access is governed by your assigned role and tenant." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Subscriptions and fees" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "PRO subscriptions are billed monthly or annually per the plan selected. Per-transaction fees may apply to direct registrations. Fees are non-refundable except where required by law." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Acceptable use" }] },
        { "type": "bulletList", "content": [
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Do not misuse the platform or attempt to access data outside your tenant." }] }] },
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Do not upload unlawful content or violate applicable UAE regulations." }] }] }
        ] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Liability" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "The service is provided on an \"as is\" basis. To the extent permitted by law, we are not liable for indirect or consequential losses. Nothing limits liability that cannot be excluded under UAE law." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Contact" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "For questions about these Terms, email legal@mandoob.ae." }] }
      ]
    }$json$::jsonb,
    $html$<p>Last updated: 22 May 2026</p>
<p>These Terms govern your access to and use of the Mandoob platform. By creating an account or using the service, you agree to these Terms.</p>
<h2>The service</h2>
<p>Mandoob provides software for UAE company registration, PRO operations, document management, renewals, and related workflows. Government fees and third-party charges are separate from any platform subscription.</p>
<h2>Accounts and roles</h2>
<p>You are responsible for the accuracy of information you provide and for safeguarding your credentials. Access is governed by your assigned role and tenant.</p>
<h2>Subscriptions and fees</h2>
<p>PRO subscriptions are billed monthly or annually per the plan selected. Per-transaction fees may apply to direct registrations. Fees are non-refundable except where required by law.</p>
<h2>Acceptable use</h2>
<ul><li><p>Do not misuse the platform or attempt to access data outside your tenant.</p></li><li><p>Do not upload unlawful content or violate applicable UAE regulations.</p></li></ul>
<h2>Liability</h2>
<p>The service is provided on an &ldquo;as is&rdquo; basis. To the extent permitted by law, we are not liable for indirect or consequential losses. Nothing limits liability that cannot be excluded under UAE law.</p>
<h2>Contact</h2>
<p>For questions about these Terms, email legal@mandoob.ae.</p>$html$,
    'published',
    '2026-05-22T00:00:00Z',
    null,
    '{"backgroundColor": "#ffffff", "overlayColor": "#000000", "overlayOpacity": 0, "headingAlignment": "center", "textAlignment": "center", "buttonAlignment": "center"}'::jsonb,
    'Terms & Conditions',
    'Terms governing access to and use of the Mandoob platform and related services.',
    'https://mandoob.ae/legal/terms',
    false,
    '{}'::jsonb
  ),
  (
    'pdpl',
    'PDPL Statement',
    $json${
      "type": "doc",
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "Last updated: 22 May 2026" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "Mandoob processes personal data in accordance with the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021). We support consent tracking, data-processing agreements per tenant, and the right to erasure." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Data residency" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "Data is hosted in the nearest Middle East region, with an architecture able to migrate to UAE-hosted infrastructure should regulation require it." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Requests" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "To raise a PDPL request, email privacy@mandoob.ae." }] }
      ]
    }$json$::jsonb,
    $html$<p>Last updated: 22 May 2026</p>
<p>Mandoob processes personal data in accordance with the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021). We support consent tracking, data-processing agreements per tenant, and the right to erasure.</p>
<h2>Data residency</h2>
<p>Data is hosted in the nearest Middle East region, with an architecture able to migrate to UAE-hosted infrastructure should regulation require it.</p>
<h2>Requests</h2>
<p>To raise a PDPL request, email privacy@mandoob.ae.</p>$html$,
    'published',
    '2026-05-22T00:00:00Z',
    null,
    '{"backgroundColor": "#ffffff", "overlayColor": "#000000", "overlayOpacity": 0, "headingAlignment": "center", "textAlignment": "center", "buttonAlignment": "center"}'::jsonb,
    'PDPL Statement',
    'Mandoob data processing, residency, and request handling under the UAE PDPL.',
    'https://mandoob.ae/legal/pdpl',
    false,
    '{}'::jsonb
  ),
  (
    'trust',
    'Trust Center',
    $json${
      "type": "doc",
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "Last updated: 22 May 2026" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "Security is foundational to Mandoob. We enforce role-based access, per-tenant isolation via Postgres row-level security, encryption in transit and at rest, and a complete audit trail of mutating actions." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Certifications" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "PDPL aligned · ISO 27001 · TLS 1.3 · SOC 2 in progress." }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Reporting" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "Report a security concern to security@mandoob.ae." }] }
      ]
    }$json$::jsonb,
    $html$<p>Last updated: 22 May 2026</p>
<p>Security is foundational to Mandoob. We enforce role-based access, per-tenant isolation via Postgres row-level security, encryption in transit and at rest, and a complete audit trail of mutating actions.</p>
<h2>Certifications</h2>
<p>PDPL aligned · ISO 27001 · TLS 1.3 · SOC 2 in progress.</p>
<h2>Reporting</h2>
<p>Report a security concern to security@mandoob.ae.</p>$html$,
    'published',
    '2026-05-22T00:00:00Z',
    null,
    '{"backgroundColor": "#ffffff", "overlayColor": "#000000", "overlayOpacity": 0, "headingAlignment": "center", "textAlignment": "center", "buttonAlignment": "center"}'::jsonb,
    'Trust Center',
    'Mandoob security controls, compliance posture, certifications, and reporting channel.',
    'https://mandoob.ae/legal/trust',
    false,
    '{}'::jsonb
  )
on conflict (slug) where deleted_at is null do update set
  title = excluded.title,
  content_json = excluded.content_json,
  content_html = excluded.content_html,
  status = excluded.status,
  published_at = excluded.published_at,
  scheduled_for = excluded.scheduled_for,
  hero_settings = excluded.hero_settings,
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  canonical_url = excluded.canonical_url,
  noindex = excluded.noindex,
  schema_markup = excluded.schema_markup;
