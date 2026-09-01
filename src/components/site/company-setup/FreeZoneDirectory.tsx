'use client';

import Link from 'next/link';
import { useState } from 'react';
import type {
  FreeZoneDirectoryItem,
  SetupDirectoryFilters,
} from '@/lib/public-company-setup/contracts';
import { EMPTY_FILTERS, filterFreeZones } from '@/lib/public-company-setup/filter';

export function FreeZoneDirectory({ rows }: { rows: readonly FreeZoneDirectoryItem[] }) {
  const [draft, setDraft] = useState<SetupDirectoryFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<SetupDirectoryFilters>(EMPTY_FILTERS);
  const results = filterFreeZones(rows, filters);
  const update = <K extends keyof SetupDirectoryFilters>(key: K, value: SetupDirectoryFilters[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="setup-directory__layout">
      <form
        className="setup-filter"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters(draft);
        }}
      >
        <h3>Filter Free Zones</h3>
        <label>
          Search by name
          <input value={draft.query} onChange={(event) => update('query', event.target.value)} />
        </label>
        <label>
          Emirate
          <select
            value={draft.emirate}
            onChange={(event) =>
              update('emirate', event.target.value as SetupDirectoryFilters['emirate'])
            }
          >
            <option value="all">All emirates</option>
            <option value="dubai">Dubai</option>
            <option value="sharjah">Sharjah</option>
            <option value="ras_al_khaimah">Ras Al Khaimah</option>
          </select>
        </label>
        <label>
          Business type
          <select
            value={draft.businessType}
            onChange={(event) =>
              update('businessType', event.target.value as SetupDirectoryFilters['businessType'])
            }
          >
            <option value="all">All types</option>
            <option value="commercial">Commercial</option>
            <option value="professional">Professional</option>
            <option value="industrial">Industrial</option>
            <option value="creative">Creative</option>
          </select>
        </label>
        <label>
          Office type
          <select
            value={draft.officeType}
            onChange={(event) =>
              update('officeType', event.target.value as SetupDirectoryFilters['officeType'])
            }
          >
            <option value="all">Any office</option>
            <option value="flexi">Flexi desk</option>
            <option value="physical">Physical office</option>
          </select>
        </label>
        <label>
          Indicative budget
          <select
            value={draft.budget}
            onChange={(event) =>
              update('budget', event.target.value as SetupDirectoryFilters['budget'])
            }
          >
            <option value="all">Any budget</option>
            <option value="under_15000">Under AED 15,000</option>
            <option value="15000_25000">AED 15,000–25,000</option>
            <option value="over_25000">Over AED 25,000</option>
          </select>
        </label>
        <div className="setup-filter__actions">
          <button className="btn btn--accent" type="submit">
            Apply filters
          </button>
          <button
            className="btn btn--outline"
            type="button"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              setFilters(EMPTY_FILTERS);
            }}
          >
            Clear
          </button>
        </div>
      </form>
      <div className="setup-directory">
        <p className="setup-directory__count" aria-live="polite">
          {results.length} matching Free Zones
        </p>
        <div className="setup-directory__table-wrap">
          {results.length ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">Authority</th>
                  <th scope="col">Emirate</th>
                  <th scope="col">Business type</th>
                  <th scope="col">Ownership</th>
                  <th scope="col">Indicative cost</th>
                  <th scope="col">Timeline</th>
                  <th scope="col">Explore</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </td>
                    <td>{item.emirateLabel}</td>
                    <td>{item.businessTypes.join(', ')}</td>
                    <td>Authority rules apply</td>
                    <td>{item.costLabel}</td>
                    <td>{item.timelineLabel}</td>
                    <td>
                      <Link className="setup-card__link" href={item.href}>
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="setup-directory__empty">
              No Free Zones match these filters. Clear or broaden your criteria.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
