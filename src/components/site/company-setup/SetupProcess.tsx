import type { ReactNode } from 'react';

export type SetupProcessStep = {
  title: string;
  description: string;
  icon: ReactNode;
};

export function SetupProcess({ steps }: { steps: readonly SetupProcessStep[] }) {
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
