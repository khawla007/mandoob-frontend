import { BellRing, IdCard, ScrollText, ShieldCheck, Stamp } from 'lucide-react';

export function ProSuiteSection() {
  return (
    <section id="pro-suite" className="section" aria-labelledby="suite-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow">01 · Platform</span>
          <h2 id="suite-h" className="h2">
            Built for PROs managing 50 to 5,000 clients.
          </h2>
        </header>
      </div>
      <div className="container">
        <ul
          className="mosaic"
          role="list"
          aria-label="Platform capabilities"
          data-reveal-cards
        >
          <li className="cell cell--table reveal">
            <span className="cell__mark--plat" aria-hidden="true">
              P·01
            </span>
            <div className="cell__head">
              <span className="cell__icon" aria-hidden="true">
                <ShieldCheck size={16} strokeWidth={1.75} />
              </span>
              <span className="eyebrow">Multi-tenant control</span>
            </div>
            <h3>Every client, isolated at the row.</h3>
            <p>
              Postgres RLS enforces tenant_id on every table. Switch tenants without leaking a
              record.
            </p>
            <table className="mini-table">
              <caption className="visually-hidden">
                Sample tenant client roster: Acme Trading, Naseej Group, Quay Holdings.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Type</th>
                  <th scope="col">Renewal</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Acme Trading FZ-LLC</td>
                  <td>Free Zone</td>
                  <td className="mono">14 Jun</td>
                  <td>
                    <span className="status-pill status-pill--ok">
                      <span className="visually-hidden">Status: </span>On track
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Naseej Group LLC</td>
                  <td>Mainland</td>
                  <td className="mono">02 Jun</td>
                  <td>
                    <span className="status-pill status-pill--warn">
                      <span className="visually-hidden">Status: </span>Due soon
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Quay Holdings Ltd</td>
                  <td>Offshore</td>
                  <td className="mono">28 Aug</td>
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
                  <span className="logbox__entity">client/9842</span>
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
