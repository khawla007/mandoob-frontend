'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

type Kpi = { label: string; value: string; tone?: 'default' | 'alert' };
type FeedItem = { label: string; meta: string; live?: boolean };
type Panel = { kpis: Kpi[]; feedTitle: string; feed: FeedItem[] };

const NAV = ['Overview', 'Clients', 'Renewals', 'Documents', 'Invoices', 'Activity'] as const;
type Nav = (typeof NAV)[number];

const PANEL_ID = 'dash-panel';
const tabId = (key: Nav) => `dash-tab-${key.toLowerCase()}`;

const PANELS: Record<Nav, Panel> = {
  Overview: {
    kpis: [
      { label: 'CLIENTS', value: '128' },
      { label: 'RENEWALS 30D', value: '14', tone: 'alert' },
      { label: 'OPEN INV', value: 'AED 42,180' },
      { label: 'ON-TIME', value: '98%' },
    ],
    feedTitle: 'ACTIVITY',
    feed: [
      { label: 'Visa stamped · Reem A.', meta: '12:42', live: true },
      { label: 'Renewal · Acme FZ-LLC · 7 days', meta: '12:18' },
      { label: 'Invoice paid · INV-1042', meta: '11:55' },
    ],
  },
  Clients: {
    kpis: [
      { label: 'TOTAL', value: '128' },
      { label: 'MAINLAND', value: '54' },
      { label: 'FREE ZONE', value: '61' },
      { label: 'OFFSHORE', value: '13' },
    ],
    feedTitle: 'CLIENTS',
    feed: [
      { label: 'Acme Trading FZ-LLC', meta: 'Free Zone' },
      { label: 'Naseej Group LLC', meta: 'Mainland' },
      { label: 'Quay Holdings Ltd', meta: 'Offshore' },
    ],
  },
  Renewals: {
    kpis: [
      { label: 'DUE 7D', value: '5', tone: 'alert' },
      { label: 'DUE 30D', value: '14' },
      { label: 'DUE 90D', value: '39' },
      { label: 'OVERDUE', value: '0' },
    ],
    feedTitle: 'UPCOMING',
    feed: [
      { label: 'Acme FZ-LLC · licence', meta: '7 days', live: true },
      { label: 'Naseej · Ejari', meta: '12 days' },
      { label: 'Reem A. · visa', meta: '21 days' },
    ],
  },
  Documents: {
    kpis: [
      { label: 'TOTAL', value: '1,204' },
      { label: 'PENDING', value: '18' },
      { label: 'VERIFIED', value: '1,186' },
      { label: 'EXPIRING', value: '9', tone: 'alert' },
    ],
    feedTitle: 'RECENT',
    feed: [
      { label: 'Passport · Reem A.', meta: 'uploaded' },
      { label: 'MoA · Acme', meta: 'verified' },
      { label: 'Ejari · Naseej', meta: 'pending' },
    ],
  },
  Invoices: {
    kpis: [
      { label: 'OPEN', value: 'AED 42,180' },
      { label: 'PAID 30D', value: 'AED 96,400' },
      { label: 'OVERDUE', value: 'AED 3,200', tone: 'alert' },
      { label: 'DRAFTS', value: '4' },
    ],
    feedTitle: 'INVOICES',
    feed: [
      { label: 'INV-1042 · Acme', meta: 'paid' },
      { label: 'INV-1041 · Naseej', meta: 'sent' },
      { label: 'INV-1039 · Quay', meta: 'overdue' },
    ],
  },
  Activity: {
    kpis: [
      { label: 'TODAY', value: '32' },
      { label: 'THIS WEEK', value: '214' },
      { label: 'ACTORS', value: '9' },
      { label: 'FLAGGED', value: '0' },
    ],
    feedTitle: 'LOG',
    feed: [
      { label: 'visa.stamp · client/9842', meta: '12:42', live: true },
      { label: 'invoice.paid · inv/1042', meta: '11:55' },
      { label: 'renewal.alert · lic/acme', meta: '09:00' },
    ],
  },
};

export function DashboardPreview() {
  const [active, setActive] = useState<Nav>('Overview');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panel = PANELS[active];

  const selectTab = (index: number, focus: boolean) => {
    const key = NAV[index];
    setActive(key);
    const el = tabRefs.current[index];
    if (focus) el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = NAV.indexOf(active);
    let next = current;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % NAV.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + NAV.length) % NAV.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = NAV.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectTab(next, true);
  };

  return (
    <figure className="frame reveal">
      <div className="frame__bar">
        <span className="fstatus" aria-hidden="true" />
        <span className="frame__meta mono">Asia/Dubai · live</span>
      </div>
      <div className="frame__body">
        <div
          className="fside"
          role="tablist"
          aria-label="Dashboard preview sections"
          onKeyDown={onKeyDown}
        >
          <ul role="presentation">
            {NAV.map((item, i) => {
              const selected = active === item;
              return (
                <li
                  key={item}
                  role="presentation"
                  className={selected ? 'is-active' : undefined}
                >
                  <button
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={tabId(item)}
                    aria-selected={selected}
                    aria-controls={PANEL_ID}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectTab(i, false)}
                  >
                    <span className="fside__label">{item}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="fmain" role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(active)}>
          <div className="fkpis" aria-live="polite" aria-atomic="true">
            {panel.kpis.map((kpi) => (
              <div key={kpi.label}>
                <p className="fkpiL mono">{kpi.label}</p>
                <p className={kpi.tone === 'alert' ? 'fkpiV fkpiV--alert mono' : 'fkpiV mono'}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
          <div className="ffeed">
            <p className="ffeedT mono">{panel.feedTitle}</p>
            <ul>
              {panel.feed.map((row) => (
                <li key={row.label}>
                  <span className="ffeed__label">
                    {row.live ? <span className="ffeed__live" aria-hidden="true" /> : null}
                    {row.label}
                  </span>
                  <span className="mono ffeed__meta">{row.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </figure>
  );
}
