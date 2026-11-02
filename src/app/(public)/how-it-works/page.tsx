import { buildPublicMetadata } from '@/lib/public-metadata';

export const metadata = buildPublicMetadata({
  title: 'How UAE Company Setup Works | Mandoob',
  description: 'See how to explore, estimate and start a UAE company registration with Mandoob.',
  canonical: '/how-it-works',
});

// Placeholder: page body is built in the next step.
export default function HowItWorksPage() {
  return (
    <section className="container py-16" aria-labelledby="how-it-works-title">
      <h1 id="how-it-works-title" className="home-section-title">
        How It Works
      </h1>
    </section>
  );
}
