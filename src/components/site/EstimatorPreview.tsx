'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

const PRESET_KEYS = ['mainland', 'freeZone', 'offshore'] as const;
type PresetKey = (typeof PRESET_KEYS)[number];

type Line = { label: string; amount: string };

const PANEL_ID = 'est-panel';
const TOTAL_LABEL_ID = 'est-total-label';
const tabId = (key: PresetKey) => `est-tab-${key}`;

export function EstimatorPreview() {
  const t = useTranslations('marketing.estimatorPreview');
  const [active, setActive] = useState<PresetKey>('mainland');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = PRESET_KEYS.indexOf(active);
    let next = current;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % PRESET_KEYS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + PRESET_KEYS.length) % PRESET_KEYS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = PRESET_KEYS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(PRESET_KEYS[next]);
    tabRefs.current[next]?.focus();
  };

  const lines = t.raw(`presets.${active}.lines`) as Line[];

  return (
    <div className="cell cell--estmain reveal">
      <div
        className="est__tabs"
        role="tablist"
        aria-label={t('tablistLabel')}
        onKeyDown={onKeyDown}
      >
        {PRESET_KEYS.map((key, i) => {
          const selected = active === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={selected}
              aria-controls={PANEL_ID}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'est__tab is-active' : 'est__tab'}
              onClick={() => setActive(key)}
            >
              {t(`tabs.${key}`)}
            </button>
          );
        })}
      </div>
      <div className="est__grid" role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(active)}>
        <div className="est__inputs">
          <div className="ufield">
            <span className="ufield__label">{t('fields.activity')}</span>
            <span className="ufield__val">{t(`presets.${active}.activity`)}</span>
          </div>
          <div className="ufield">
            <span className="ufield__label">{t('fields.visas')}</span>
            <span className="ufield__val mono">{t(`presets.${active}.visas`)}</span>
          </div>
          <div className="ufield">
            <span className="ufield__label">{t('fields.office')}</span>
            <span className="ufield__val">{t(`presets.${active}.office`)}</span>
          </div>
        </div>
        <div className="est__total">
          <p className="est__totalL mono" id={TOTAL_LABEL_ID}>
            {t('totalLabel')}
          </p>
          <p
            className="est__totalV mono u-accent-underline"
            aria-live="polite"
            aria-atomic="true"
            aria-labelledby={TOTAL_LABEL_ID}
          >
            {t(`presets.${active}.total`)}
          </p>
          <ul className="est__lines">
            {lines.map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <span className="mono">{line.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
