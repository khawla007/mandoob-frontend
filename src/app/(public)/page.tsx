import { buildPublicMetadata } from '@/lib/public-metadata';
import { ApplyChecklistSection } from '@/components/site/home/ApplyChecklistSection';
import { EstimatorSection } from '@/components/site/home/EstimatorSection';
import { FinalCtaSection } from '@/components/site/home/FinalCtaSection';
import { FeatureRowSection } from '@/components/site/home/FeatureRowSection';
import { FlowSection } from '@/components/site/home/FlowSection';
import { HeroSection } from '@/components/site/home/HeroSection';
import { KnowledgeFaqSection } from '@/components/site/home/KnowledgeFaqSection';
import { ServicesSection } from '@/components/site/home/ServicesSection';
import { TrustBandSection } from '@/components/site/home/TrustBandSection';
import { EntranceReveal } from '@/components/site/EntranceReveal';

export const metadata = buildPublicMetadata({
  title: 'UAE Company Setup and PRO Support | Mandoob',
  description:
    'Compare UAE Company setup paths, prepare an indicative estimate, and explore ongoing PRO support with Mandoob.',
  canonical: '/',
});

export default function MarketingHomePage() {
  return (
    <>
      <EntranceReveal />
      <HeroSection />
      <TrustBandSection />
      <ServicesSection />
      <FlowSection />
      <EstimatorSection />
      <FeatureRowSection variant="confidence" />
      <ApplyChecklistSection />
      <FeatureRowSection variant="beyond" />
      <KnowledgeFaqSection />
      <FinalCtaSection />
    </>
  );
}
