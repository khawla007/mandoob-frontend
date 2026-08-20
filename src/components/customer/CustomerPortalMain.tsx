import { DashboardSurfaceScope } from '@/components/shell/DashboardSurfaceScope';

export function CustomerPortalMain({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content">
      <DashboardSurfaceScope />
      {children}
    </main>
  );
}
