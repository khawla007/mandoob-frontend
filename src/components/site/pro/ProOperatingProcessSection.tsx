import {
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FolderKanban,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';
import type { PublicProProcessId } from '@/lib/pro/public-pro';

type IconComponent = typeof BadgeCheck;

const processIcons = {
  'request-verify': BadgeCheck,
  'company-assignment': Building2,
  'company-setup': ClipboardCheck,
  'operate-workspace': FolderKanban,
  'configured-communication': MessagesSquare,
  'authorization-audit': ShieldCheck,
} as const satisfies Record<PublicProProcessId, IconComponent>;

export function ProOperatingProcessSection() {
  const process = PUBLIC_PRO_CONTENT.process;

  return (
    <section id="pro-operating-process" className="pro-process" aria-labelledby="pro-process-title">
      <div className="container">
        <header className="pro-section-heading pro-section-heading--centered reveal">
          <span className="eyebrow eyebrow--accent">{process.eyebrow.text}</span>
          <h2 id="pro-process-title">{process.title.text}</h2>
          <p>{process.description.text}</p>
        </header>
        <ol className="pro-process__list" data-reveal-cards>
          {process.steps.map((step, index) => {
            const Icon = processIcons[step.id];
            return (
              <li className="reveal" data-pro-process-step={step.id} key={step.id}>
                <span className="pro-process__icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="pro-process__number">Step {index + 1}</span>
                <h3>{step.title.text}</h3>
                <p data-source-state={step.description.source.state}>{step.description.text}</p>
                {step.availability ? (
                  <p
                    className="pro-process__qualification"
                    data-source-state={step.availability.source.state}
                  >
                    {step.availability.text}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        <p
          className="pro-process__availability"
          data-source-state={process.availabilityNote.source.state}
        >
          {process.availabilityNote.text}
        </p>
      </div>
    </section>
  );
}
