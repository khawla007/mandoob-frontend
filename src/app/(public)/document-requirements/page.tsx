import type { Metadata } from 'next';
import { ClipboardList, Info } from 'lucide-react';

import { PublicConversionBand } from '@/components/site/about-contact/PublicConversionBand';
import { InfoCardGrid, InfoPageHero, InfoSection } from '@/components/site/resources/InfoPage';

export const metadata: Metadata = {
  title: 'Documents Required for UAE Company Registration | Mandoob',
  description: 'Prepare accurate documents before submitting your UAE company application.',
  alternates: { canonical: '/document-requirements' },
};

const GROUPS = [
  {
    title: 'All Companies',
    list: [
      'Passport copies of shareholders',
      'Passport-size photographs',
      'Proof of residential address',
      'Emirates ID and visa copy, if applicable',
      'Business plan for selected activities',
    ],
  },
  {
    title: 'Mainland / Free Zone',
    list: [
      'Memorandum of Association',
      'Tenancy contract / Ejari',
      'Initial approval application',
      'No Objection Certificate, if applicable',
      'Board resolution for corporate shareholders',
    ],
  },
  {
    title: 'Visas & Banking',
    list: [
      'Medical fitness report',
      'Emirates ID biometrics',
      'Bank reference letter',
      'CV / brief shareholder profile',
      'Proof of business substance where requested',
    ],
  },
].map((group) => ({ ...group, icon: <ClipboardList />, text: '' }));

export default function DocumentRequirementsPage() {
  return (
    <>
      <InfoPageHero
        headingId="document-requirements-title"
        eyebrow="Document Requirements"
        title="Documents Required for UAE Company Registration"
        description="Prepare accurate documents before submitting your application."
        currentLabel="Document Requirements"
        imageSrc="/hero/knowledge-base-research.webp"
        imageAlt="Preparing company registration documents"
      />
      <InfoSection
        headingId="document-requirements-list-title"
        eyebrow="Checklists"
        title="What to Prepare"
      >
        <InfoCardGrid items={GROUPS} />
        <p className="info-page__notice">
          <Info aria-hidden="true" />
          <span>
            Upload clear colour scans in PDF, JPG or PNG. Your PRO reviews each file and requests
            corrections before authority submission.
          </span>
        </p>
      </InfoSection>
      <PublicConversionBand
        headingId="document-requirements-conversion-title"
        title="Ready to upload your documents?"
        description="Create an application and use the secure document workspace."
        primaryCta={{ label: 'Start Registration', href: '/apply' }}
        secondaryCta={{ label: 'Contact Us', href: '/contact' }}
      />
    </>
  );
}
