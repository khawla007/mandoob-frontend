import type { ReactNode } from 'react';

export type RaisedInfoItem = {
  title: string;
  description: ReactNode;
  icon: ReactNode;
};

type RaisedInfoItems = readonly [
  RaisedInfoItem,
  RaisedInfoItem,
  RaisedInfoItem,
  RaisedInfoItem,
  RaisedInfoItem,
];

type RaisedInfoStripProps = {
  headingId: string;
  heading: string;
  headingVisible?: boolean;
  items: RaisedInfoItems;
};

export function RaisedInfoStrip({
  headingId,
  heading,
  headingVisible = false,
  items,
}: RaisedInfoStripProps) {
  return (
    <section className="about-contact-info-strip container" aria-labelledby={headingId}>
      <h2 id={headingId} className={headingVisible ? undefined : 'sr-only'}>
        {heading}
      </h2>
      <ul className="about-contact-info-strip__list">
        {items.map((item) => (
          <li key={item.title}>
            <span className="about-contact-info-strip__icon" aria-hidden="true">
              {item.icon}
            </span>
            <h3>{item.title}</h3>
            <div className="about-contact-info-strip__description">{item.description}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
