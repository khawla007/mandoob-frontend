import { EstimatorSection } from '@/components/site/home/EstimatorSection';
import { FinalCtaSection } from '@/components/site/home/FinalCtaSection';
import { FlowSection } from '@/components/site/home/FlowSection';
import { HeroSection } from '@/components/site/home/HeroSection';
import { KnowledgeFaqSection } from '@/components/site/home/KnowledgeFaqSection';
import { ServicesSection } from '@/components/site/home/ServicesSection';
import { SupportServicesSection } from '@/components/site/home/SupportServicesSection';
import { TrustBandSection } from '@/components/site/home/TrustBandSection';
import { TestimonialsSection } from '@/components/site/home/TestimonialsSection';
import { WhyMandoobSection } from '@/components/site/home/WhyMandoobSection';
import { EntranceReveal } from '@/components/site/EntranceReveal';

export default function MarketingHomePage() {
  return (
    <>
      <EntranceReveal />
      <HeroSection />
      <TrustBandSection />
      <ServicesSection />
      <FlowSection />
      <EstimatorSection />
      <SupportServicesSection />
      <WhyMandoobSection />
      <TestimonialsSection />
      <KnowledgeFaqSection />
      <FinalCtaSection />
    </>
  );
}
