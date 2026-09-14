import type { ReactNode } from 'react';

type SetupPanelProps = {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

export function SetupPanel({ title, description, className = '', children }: SetupPanelProps) {
  return (
    <article className={`setup-panel ${className}`.trim()}>
      <header>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </article>
  );
}
