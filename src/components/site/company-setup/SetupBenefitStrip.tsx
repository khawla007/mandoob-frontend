import type { ReactNode } from 'react';

export type SetupBenefit = {
  title: string;
  detail?: string;
  icon: ReactNode;
};

export function SetupBenefitStrip({ items }: { items: readonly SetupBenefit[] }) {
  return (
    <div className="container">
      <ul className="setup-benefit-strip" aria-label="Setup considerations">
        {items.map((item) => (
          <li key={item.title}>
            <span className="setup-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>
              <strong>{item.title}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
