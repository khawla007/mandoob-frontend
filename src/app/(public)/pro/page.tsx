import { BentoGridSection } from '@/components/site/home/BentoGridSection';
import { DashboardSection } from '@/components/site/home/DashboardSection';
import { ProSuiteSection } from '@/components/site/home/ProSuiteSection';
import { ProAudienceFitSection } from '@/components/site/pro/ProAudienceFitSection';
import { ProFinalCtaSection } from '@/components/site/pro/ProFinalCtaSection';
import { ProHeroSection } from '@/components/site/pro/ProHeroSection';
import { ProOperatingProcessSection } from '@/components/site/pro/ProOperatingProcessSection';
import { EntranceReveal } from '@/components/site/EntranceReveal';

export default function ProLandingPage() {
  return (
    <>
      <EntranceReveal />
      <ProHeroSection />
      <ProAudienceFitSection />
      <ProSuiteSection variant="pro" />
      <ProOperatingProcessSection />
      <DashboardSection />
      <BentoGridSection />
      <ProFinalCtaSection />
    </>
  );
}
