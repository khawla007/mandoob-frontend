import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mandoob',
  description: 'UAE Business Registration & PRO Management Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children as React.ReactElement;
}
