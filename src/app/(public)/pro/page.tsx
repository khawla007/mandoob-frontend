import { BentoGridSection } from '@/components/site/home/BentoGridSection';
import { DashboardSection } from '@/components/site/home/DashboardSection';
import { ProAudienceFitSection } from '@/components/site/pro/ProAudienceFitSection';
import { ProCapabilitiesSection } from '@/components/site/pro/ProCapabilitiesSection';
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
      <ProCapabilitiesSection />
      <ProOperatingProcessSection />
      <DashboardSection />
      <BentoGridSection />
      <ProFinalCtaSection />
    </>
  );
}
