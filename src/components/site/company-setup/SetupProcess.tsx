import type { ReactNode } from 'react';

export type SetupProcessStep = {
  title: string;
  description: string;
  icon: ReactNode;
};

export function SetupProcess({
  steps,
  variant = 'cards',
}: {
  steps: readonly SetupProcessStep[];
  variant?: 'cards' | 'timeline' | 'stepper';
}) {
  if (variant === 'stepper') {
    // Design HTML progress tracker: numbered circles on one line, title below.
    return (
      <ol className="setup-stepper">
        {steps.map((step, index) => (
          <li key={step.title} data-active={index === 0 ? 'true' : undefined}>
            <span className="setup-stepper__num" aria-hidden="true">
              {index + 1}
            </span>
            <span className="setup-stepper__label">{step.title}</span>
            <span className="sr-only">{step.description}</span>
          </li>
        ))}
      </ol>
    );
  }

  if (variant === 'timeline') {
    return (
      <ol className="bizreg-process">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="bizreg-icon bizreg-icon--ring" aria-hidden="true">
              {step.icon}
            </span>
            <span className="bizreg-badge" aria-hidden="true">
              {index + 1}
            </span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="setup-process">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="setup-process__number">{String(index + 1).padStart(2, '0')}</span>
          <span className="setup-icon" aria-hidden="true">
            {step.icon}
          </span>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </li>
      ))}
    </ol>
  );
}
