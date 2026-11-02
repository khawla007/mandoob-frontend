import {
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FolderOpen,
  Headset,
  MonitorCheck,
  ReceiptText,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';

const SECTIONS = {
  confidence: {
    id: 'confidence',
    items: [
      ['costs', ReceiptText],
      ['checklist', ClipboardCheck],
      ['timelines', Clock3],
      ['support', Headset],
    ],
  },
  beyond: {
    id: 'beyond',
    items: [
      ['tracking', MonitorCheck],
      ['documents', FolderOpen],
      ['renewals', CalendarClock],
      ['pro', UserRoundCheck],
    ],
  },
} as const satisfies Record<
  string,
  { id: string; items: readonly (readonly [string, LucideIcon])[] }
>;

type FeatureRowSectionProps = {
  variant: keyof typeof SECTIONS;
};

/** Centered heading followed by a four-up icon + copy row (homepage reference layout). */
export async function FeatureRowSection({ variant }: FeatureRowSectionProps) {
  const { id, items } = SECTIONS[variant];
  const t = await getTranslations(`home.${variant}`);
  const headingId = `home-${id}-h`;

  return (
    <section
      className={`home-feature-row-section home-feature-row-section--${id}`}
      aria-labelledby={headingId}
    >
      <div className="container">
        <h2 id={headingId} className="home-section-title home-feature-row-section__title reveal">
          {t('title')}
        </h2>
        <ul className="home-feature-row" role="list" data-reveal-cards>
          {items.map(([key, Icon], index) => (
            <li className="reveal" key={key} style={{ '--reveal-i': index } as CSSProperties}>
              <span className={`home-icon-medallion home-icon-medallion--${index + 1}`}>
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h3>{t(`${key}Title`)}</h3>
                <p>{t(`${key}Text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
