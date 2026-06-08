import { AppShell } from '@/components/app/AppShell';

export default function TenantRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell lang="en" dir="ltr">
      {children}
    </AppShell>
  );
}
