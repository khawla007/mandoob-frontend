import { AnnotatedShowcaseSection } from '@/components/site/home/AnnotatedShowcaseSection';
import { CustomersSection } from '@/components/site/home/CustomersSection';
import { EstimatorSection } from '@/components/site/home/EstimatorSection';
import { FinalCtaSection } from '@/components/site/home/FinalCtaSection';
import { FlowSection } from '@/components/site/home/FlowSection';
import { HeroSection } from '@/components/site/home/HeroSection';
import { ServicesSection } from '@/components/site/home/ServicesSection';
import { TrustBandSection } from '@/components/site/home/TrustBandSection';
import { WhyMandoobSection } from '@/components/site/home/WhyMandoobSection';
import { EntranceReveal } from '@/components/site/EntranceReveal';

export default function MarketingHomePage() {
  return (
    <>
      <EntranceReveal />
      <HeroSection />
      <TrustBandSection />
      <ServicesSection />
      <EstimatorSection />
      <FlowSection />
      <WhyMandoobSection />
      <AnnotatedShowcaseSection />
      <CustomersSection />
      <FinalCtaSection />
    </>
  );
}
