import type { Metadata } from 'next';

import { AboutPageBody } from '@/components/site/about/AboutPageBody';

export const metadata: Metadata = {
  title: 'About Mandoob',
  description: 'Learn how Mandoob supports UAE company setup and business administration.',
  alternates: { canonical: 'https://mandoob.ae/about' },
};

export default function AboutPage() {
  return <AboutPageBody />;
}
