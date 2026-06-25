import { BentoGridSection } from '@/components/site/home/BentoGridSection';
import { DashboardSection } from '@/components/site/home/DashboardSection';
import { ProSuiteSection } from '@/components/site/home/ProSuiteSection';
import { TrustBandSection } from '@/components/site/home/TrustBandSection';
import { ProFinalCtaSection } from '@/components/site/pro/ProFinalCtaSection';
import { ProHeroSection } from '@/components/site/pro/ProHeroSection';
import { EntranceReveal } from '@/components/site/EntranceReveal';

export default function ProLandingPage() {
  return (
    <>
      <EntranceReveal />
      <ProHeroSection />
      <TrustBandSection />
      <ProSuiteSection />
      <DashboardSection />
      <BentoGridSection />
      <ProFinalCtaSection />
    </>
  );
}
