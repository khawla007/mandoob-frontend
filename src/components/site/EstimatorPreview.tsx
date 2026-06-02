'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

type Jurisdiction = 'Mainland' | 'Free Zone' | 'Offshore';

type Preset = {
  activity: string;
  visas: string;
  office: string;
  total: string;
  lines: { label: string; amount: string }[];
};

// Illustrative sample quotes for the landing preview only.
// The real, live calculation lives at /estimate.
const PRESETS: Record<Jurisdiction, Preset> = {
  Mainland: {
    activity: 'Consulting & advisory',
    visas: '2',
    office: 'Flexi desk',
    total: 'AED 18,450',
    lines: [
      { label: 'DED Initial Approval', amount: '600' },
      { label: 'Trade Licence · 1 yr', amount: '12,500' },
      { label: 'Visa × 2', amount: '4,200' },
      { label: 'Mandoob PRO fee', amount: '1,150' },
    ],
  },
  'Free Zone': {
    activity: 'Trading (general)',
    visas: '3',
    office: 'Shared office',
    total: 'AED 23,900',
    lines: [
      { label: 'FZ Registration', amount: '1,500' },
      { label: 'Licence · 1 yr', amount: '15,000' },
      { label: 'Visa × 3', amount: '6,300' },
      { label: 'Mandoob PRO fee', amount: '1,100' },
    ],
  },
  Offshore: {
    activity: 'Asset holding',
    visas: '0',
    office: 'Not required',
    total: 'AED 11,000',
    lines: [
      { label: 'IBC Incorporation', amount: '3,500' },
      { label: 'Registered agent · 1 yr', amount: '4,000' },
      { label: 'Bank introduction', amount: '2,500' },
      { label: 'Mandoob PRO fee', amount: '1,000' },
    ],
  },
};

const TABS: Jurisdiction[] = ['Mainland', 'Free Zone', 'Offshore'];

const slug = (tab: Jurisdiction) => tab.replace(/\s+/g, '-').toLowerCase();
const tabId = (tab: Jurisdiction) => `est-tab-${slug(tab)}`;
const PANEL_ID = 'est-panel';

export function EstimatorPreview() {
  const [active, setActive] = useState<Jurisdiction>('Mainland');
  const preset = PRESETS[active];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Roving focus + automatic activation per WAI-ARIA APG tabs pattern.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.indexOf(active);
    let next = current;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % TABS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(TABS[next]);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="cell cell--estmain">
      <div className="est__tabs" role="tablist" aria-label="Jurisdiction" onKeyDown={onKeyDown}>
        {TABS.map((tab, i) => {
          const selected = active === tab;
          return (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab)}
              aria-selected={selected}
              aria-controls={PANEL_ID}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'est__tab is-active' : 'est__tab'}
              onClick={() => setActive(tab)}
            >
              {tab}
            </button>
          );
        })}
      </div>
      <div
        className="est__grid"
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabId(active)}
        tabIndex={0}
      >
        <div className="est__inputs">
          <div className="ufield">
            <span className="ufield__label">Business activity</span>
            <span className="ufield__val">{preset.activity}</span>
          </div>
          <div className="ufield">
            <span className="ufield__label">Visa count</span>
            <span className="ufield__val mono">{preset.visas}</span>
          </div>
          <div className="ufield">
            <span className="ufield__label">Office type</span>
            <span className="ufield__val">{preset.office}</span>
          </div>
        </div>
        <div className="est__total" aria-live="polite">
          <p className="est__totalL mono">TOTAL ESTIMATE</p>
          <p className="est__totalV mono u-accent-underline">{preset.total}</p>
          <ul className="est__lines">
            {preset.lines.map((line) => (
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
