import {
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FolderKanban,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

const processIcons = [
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FolderKanban,
  MessagesSquare,
  ShieldCheck,
] as const;

export function ProOperatingProcessSection() {
  const process = PUBLIC_PRO_CONTENT.process;

  return (
    <section id="pro-operating-process" className="pro-process" aria-labelledby="pro-process-title">
      <div className="container">
        <header className="pro-section-heading pro-section-heading--centered reveal">
          <span className="eyebrow eyebrow--accent">{process.eyebrow}</span>
          <h2 id="pro-process-title">{process.title}</h2>
          <p>{process.description}</p>
        </header>
        <ol className="pro-process__list" data-reveal-cards>
          {process.steps.map((step, index) => {
            const Icon = processIcons[index];
            return (
              <li className="reveal" data-pro-process-step={step.id} key={step.id}>
                <span className="pro-process__icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="pro-process__number">Step {index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            );
          })}
        </ol>
        <p className="pro-process__availability">{process.availabilityNote}</p>
      </div>
    </section>
  );
}
