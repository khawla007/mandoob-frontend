import type { ReactNode } from 'react';

export type CompactFeatureProps = {
  title: string;
  description: string;
  icon: ReactNode;
};

export function CompactFeature({ title, description, icon }: CompactFeatureProps) {
  return (
    <article className="about-contact-feature">
      <span className="about-contact-feature__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="about-contact-feature__copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </article>
  );
}
