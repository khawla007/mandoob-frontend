'use client';

import { useState } from 'react';

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

export function EstimatorPreview() {
  const [active, setActive] = useState<Jurisdiction>('Mainland');
  const preset = PRESETS[active];

  return (
    <div className="cell cell--estmain">
      <div className="est__tabs" role="tablist" aria-label="Jurisdiction">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            className={active === tab ? 'est__tab is-active' : 'est__tab'}
            onClick={() => setActive(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="est__grid">
        <div className="est__inputs">
          <label className="ufield">
            <span className="ufield__label">Business activity</span>
            <span className="ufield__val">{preset.activity}</span>
          </label>
          <label className="ufield">
            <span className="ufield__label">Visa count</span>
            <span className="ufield__val mono">{preset.visas}</span>
          </label>
          <label className="ufield">
            <span className="ufield__label">Office type</span>
            <span className="ufield__val">{preset.office}</span>
          </label>
        </div>
        <div className="est__total">
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
