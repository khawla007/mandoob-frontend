import {
  BellRing,
  Building2,
  CreditCard,
  Files,
  IdCard,
  ScrollText,
  ShieldCheck,
  Stamp,
  UsersRound,
} from 'lucide-react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';
import type { PublicProCapabilityId } from '@/lib/pro/public-pro';

type ProSuiteSectionProps = {
  variant?: 'home' | 'pro';
};

const proCapabilityPresentation = {
  'company-foundations': { className: 'cell--table', icon: Building2 },
  'workforce-portals': { className: 'cell--log', icon: UsersRound },
  'records-audit': { className: 'cell--visas', icon: Files },
  renewals: { className: 'cell--eid', icon: BellRing },
  'invoices-payments': { className: 'cell--renewals', icon: CreditCard },
} as const satisfies Record<PublicProCapabilityId, { className: string; icon: typeof Building2 }>;

function PublicProSuite() {
  const capabilities = PUBLIC_PRO_CONTENT.capabilities;

  return (
    <section
      id="pro-capabilities"
      className="section pro-capabilities"
      aria-labelledby="pro-capabilities-title"
    >
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">{capabilities.eyebrow}</span>
          <h2 id="pro-capabilities-title" className="h2">
            {capabilities.title}
          </h2>
          <p>{capabilities.description}</p>
        </header>
      </div>
      <div className="container">
        <ul
          className="mosaic pro-capabilities__mosaic"
          role="list"
          aria-label="PRO operational capabilities"
          data-reveal-cards
        >
          {capabilities.items.map((item, index) => {
            const presentation = proCapabilityPresentation[item.id];
            const Icon = presentation.icon;
            return (
              <li
                className={`cell ${presentation.className} reveal`}
                data-pro-capability={item.id}
                key={item.id}
              >
                <span className="cell__mark--plat" aria-hidden="true">
                  P·{String(index + 1).padStart(2, '0')}
                </span>
                <div className="cell__head">
                  <span className="cell__icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <span className="eyebrow">{item.title}</span>
                </div>
                <h3 data-source-state={item.summary.source.state}>{item.summary.text}</h3>
                {item.facts.map((fact) => (
                  <p data-source-state={fact.source.state} key={fact.text}>
                    {fact.text}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function ProSuiteSection({ variant = 'home' }: ProSuiteSectionProps = {}) {
  if (variant === 'pro') return <PublicProSuite />;

  return (
    <section id="pro-suite" className="section" aria-labelledby="suite-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">01 · Platform</span>
          <h2 id="suite-h" className="h2">
            Built for a PRO working in one assigned company.
          </h2>
        </header>
      </div>
      <div className="container">
        <ul className="mosaic" role="list" aria-label="Platform capabilities" data-reveal-cards>
          <li className="cell cell--table reveal">
            <span className="cell__mark--plat" aria-hidden="true">
              P·01
            </span>
            <div className="cell__head">
              <span className="cell__icon" aria-hidden="true">
                <ShieldCheck size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Company workspace access</span>
            </div>
            <h3>One active company assignment, isolated at the row.</h3>
            <p>
              Mandoob platform policy links each PRO account to one active company workspace.
              Postgres RLS keeps every assigned-company record isolated.
            </p>
            <table className="mini-table">
              <caption className="visually-hidden">
                Sample assigned company workspace for Acme Trading.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Detail</th>
                  <th scope="col">State</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Legal company</td>
                  <td>Acme Trading FZ-LLC</td>
                  <td className="mono">VERIFIED</td>
                  <td>
                    <span className="status-pill status-pill--ok">
                      <span className="visually-hidden">Status: </span>On track
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Company workspace</td>
                  <td>acme.mandoob.app</td>
                  <td className="mono">LIVE</td>
                  <td>
                    <span className="status-pill status-pill--ok">
                      <span className="visually-hidden">Status: </span>Ready
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>PRO assignment</td>
                  <td>Dedicated PRO</td>
                  <td className="mono">ACTIVE</td>
                  <td>
                    <span className="status-pill status-pill--ok">
                      <span className="visually-hidden">Status: </span>On track
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </li>

          <li className="cell cell--log reveal">
            <span className="cell__mark--plat" aria-hidden="true">
              P·02
            </span>
            <div className="cell__head">
              <span className="cell__icon" aria-hidden="true">
                <ScrollText size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Audit trail</span>
            </div>
            <h3>Stamp the visa, log the actor.</h3>
            <figure className="logbox-wrap" aria-label="Recent audit events">
              <header className="logbox__chrome" aria-hidden="true">
                <span className="logbox__dot" />
                <span>activity.log</span>
                <span className="logbox__meta">live</span>
              </header>
              <ol
                className="logbox__stream"
                aria-label="Sample audit events: visa stamped, invoice paid, renewal alert fired."
              >
                <li>
                  <time dateTime="2026-05-18T12:42:09Z">12:42:09</time>
                  <span className="logbox__verb">visa.stamp</span>
                  <span className="logbox__entity">company/9842</span>
                  <span className="logbox__actor">pro</span>
                </li>
                <li>
                  <time dateTime="2026-05-18T11:55:01Z">11:55:01</time>
                  <span className="logbox__verb">invoice.paid</span>
                  <span className="logbox__entity">inv/1042</span>
                  <span className="logbox__actor">pro</span>
                </li>
                <li>
                  <time dateTime="2026-05-18T09:00:00Z">09:00:00</time>
                  <span className="logbox__verb">renewal.alert</span>
                  <span className="logbox__entity">lic/acme</span>
                  <span className="logbox__actor">sys</span>
                </li>
              </ol>
            </figure>
          </li>

          <li className="cell cell--visas reveal">
            <span className="cell__mark--plat" aria-hidden="true">
              P·03
            </span>
            <div className="cell__head">
              <span className="cell__icon" aria-hidden="true">
                <Stamp size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Visas</span>
            </div>
            <h3>Three stamps, one trail.</h3>
            <ol className="step-rail" aria-label="Visa workflow stages">
              <li>
                <span className="step-rail__n mono" aria-hidden="true">
                  01
                </span>{' '}
                Type
              </li>
              <li>
                <span className="step-rail__n mono" aria-hidden="true">
                  02
                </span>{' '}
                Medical
              </li>
              <li>
                <span className="step-rail__n mono" aria-hidden="true">
                  03
                </span>{' '}
                Stamp
              </li>
            </ol>
          </li>

          <li className="cell cell--eid reveal">
            <span className="cell__mark--plat" aria-hidden="true">
              P·04
            </span>
            <div className="cell__head">
              <span className="cell__icon" aria-hidden="true">
                <IdCard size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Emirates ID</span>
            </div>
            <h3>One source of truth.</h3>
            <p className="cell__chip mono" aria-label="Sample masked Emirates ID number">
              784-••••-•••••••-•
            </p>
            <p className="cell__sub">Expiries tracked + alerted.</p>
          </li>

          <li className="cell cell--renewals reveal">
            <span className="cell__mark--plat" aria-hidden="true">
              P·05
            </span>
            <div className="cell__head">
              <span className="cell__icon" aria-hidden="true">
                <BellRing size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Renewals + invoicing</span>
            </div>
            <h3>Zero AED 25/day fines.</h3>
            <ol
              className="reminder-rail"
              aria-label="Reminder cadence: 90, 30, and 7 days before renewal."
            >
              <li aria-hidden="true">
                <span className="mono">–90d</span>
              </li>
              <li aria-hidden="true">
                <span className="mono">–30d</span>
              </li>
              <li aria-hidden="true">
                <span className="mono">–7d</span>
              </li>
            </ol>
            <p className="cell__footer">
              <span className="mono">Tap + Stripe</span> — itemized invoices, paid online.
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}
