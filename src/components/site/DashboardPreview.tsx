'use client';

import { useState } from 'react';

type Kpi = { label: string; value: string };
type FeedItem = { label: string; meta: string };
type Panel = { kpis: Kpi[]; feedTitle: string; feed: FeedItem[] };

// Illustrative sample data for the landing preview only.
const NAV = ['Overview', 'Clients', 'Renewals', 'Documents', 'Invoices', 'Activity'] as const;
type Nav = (typeof NAV)[number];

const PANELS: Record<Nav, Panel> = {
  Overview: {
    kpis: [
      { label: 'CLIENTS', value: '128' },
      { label: 'RENEWALS 30D', value: '14' },
      { label: 'OPEN INV', value: 'AED 42,180' },
      { label: 'ON-TIME', value: '98%' },
    ],
    feedTitle: 'ACTIVITY',
    feed: [
      { label: 'Visa stamped · Reem A.', meta: '12:42' },
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
      { label: 'DUE 7D', value: '5' },
      { label: 'DUE 30D', value: '14' },
      { label: 'DUE 90D', value: '39' },
      { label: 'OVERDUE', value: '0' },
    ],
    feedTitle: 'UPCOMING',
    feed: [
      { label: 'Acme FZ-LLC · licence', meta: '7 days' },
      { label: 'Naseej · Ejari', meta: '12 days' },
      { label: 'Reem A. · visa', meta: '21 days' },
    ],
  },
  Documents: {
    kpis: [
      { label: 'TOTAL', value: '1,204' },
      { label: 'PENDING', value: '18' },
      { label: 'VERIFIED', value: '1,186' },
      { label: 'EXPIRING', value: '9' },
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
      { label: 'OVERDUE', value: 'AED 3,200' },
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
      { label: 'visa.stamp · client/9842', meta: '12:42' },
      { label: 'invoice.paid · inv/1042', meta: '11:55' },
      { label: 'renewal.alert · lic/acme', meta: '09:00' },
    ],
  },
};

export function DashboardPreview() {
  const [active, setActive] = useState<Nav>('Overview');
  const panel = PANELS[active];

  return (
    <figure className="frame">
      <div className="frame__bar">
        <span className="fdot" />
        <span className="fdot" />
        <span className="fdot" />
        <span className="frame__url mono">app.mandoob.ae/t/horizon</span>
      </div>
      <div className="frame__body">
        <aside className="fside">
          <ul>
            {NAV.map((item) => (
              <li key={item} className={active === item ? 'is-active' : undefined}>
                <button
                  type="button"
                  aria-current={active === item ? 'page' : undefined}
                  onClick={() => setActive(item)}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="fmain">
          <div className="fkpis">
            {panel.kpis.map((kpi) => (
              <div key={kpi.label}>
                <p className="fkpiL mono">{kpi.label}</p>
                <p className="fkpiV mono">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="ffeed">
            <p className="ffeedT mono">{panel.feedTitle}</p>
            <ul>
              {panel.feed.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <span className="mono">{row.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </figure>
  );
}
