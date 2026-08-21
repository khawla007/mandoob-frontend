'use client';

import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import type { CompanyOnboardingSectionKey } from '@/lib/company-onboarding/contracts';
import { cn } from '@/lib/utils';
import { confirmOnboardingNavigation } from './form-utils';

export type OnboardingStep = {
  key: CompanyOnboardingSectionKey | 'review';
  href: string;
  label: string;
  status: 'complete' | 'current' | 'incomplete';
};

export type OnboardingShellLabels = {
  eyebrow: string;
  title: string;
  description: string;
  navigationLabel: string;
  leaveWarning: string;
  status: Record<OnboardingStep['status'], string>;
};

export function OnboardingShell({
  labels,
  steps,
  children,
}: {
  labels: OnboardingShellLabels;
  steps: OnboardingStep[];
  children: ReactNode;
}) {
  function handleStepNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!confirmOnboardingNavigation(labels.leaveWarning)) event.preventDefault();
  }

  return (
    <section className="min-w-0 space-y-6">
      <header className="space-y-2">
        <p className="text-primary font-mono text-xs tracking-wide uppercase">{labels.eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{labels.title}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm md:text-base">{labels.description}</p>
      </header>

      <div className="grid min-w-0 gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label={labels.navigationLabel}
          className="max-w-full overflow-x-auto md:overflow-visible"
        >
          <ol className="flex min-w-max gap-2 pb-2 md:min-w-0 md:flex-col md:pb-0">
            {steps.map((step) => {
              const current = step.status === 'current';
              const Icon =
                step.status === 'complete' ? CheckCircle2 : current ? CircleDot : CircleDashed;
              return (
                <li key={step.key} className="min-w-40 md:min-w-0">
                  <Link
                    href={step.href}
                    onClick={handleStepNavigation}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-start outline-none focus-visible:ring-2',
                      current
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border/70 bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{step.label}</span>
                      <span className="block text-xs">{labels.status[step.status]}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="signal-panel min-w-0 rounded-2xl border p-4 md:p-6">{children}</div>
      </div>
    </section>
  );
}
