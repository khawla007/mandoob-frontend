import type { Metadata } from 'next';

import { BentoGridSection } from '@/components/site/home/BentoGridSection';
import { ProSuiteSection } from '@/components/site/home/ProSuiteSection';
import { ProAudienceFitSection } from '@/components/site/pro/ProAudienceFitSection';
import { ProBenefitsFaqSection } from '@/components/site/pro/ProBenefitsFaqSection';
import { ProDashboardSection } from '@/components/site/pro/ProDashboardSection';
import { ProFinalCtaSection } from '@/components/site/pro/ProFinalCtaSection';
import { ProHeroSection } from '@/components/site/pro/ProHeroSection';
import { ProOperatingProcessSection } from '@/components/site/pro/ProOperatingProcessSection';
import { EntranceReveal } from '@/components/site/EntranceReveal';

export const metadata: Metadata = {
  title: 'Mandoob for PROs',
  description:
    'Explore a focused Mandoob workspace for a verified PRO operating one assigned Company.',
  alternates: { canonical: 'https://mandoob.ae/pro' },
};

export default function ProLandingPage() {
  return (
    <>
      <EntranceReveal />
      <ProHeroSection />
      <ProAudienceFitSection />
      <ProSuiteSection variant="pro" />
      <ProOperatingProcessSection />
      <ProDashboardSection />
      <BentoGridSection variant="pro" />
      <ProBenefitsFaqSection />
      <ProFinalCtaSection />
    </>
  );
}
