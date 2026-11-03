'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * Shows the first category cards and reveals the rest below them.
 * "View All Categories" expands; "Show Less" collapses back to the first row.
 */
export function KnowledgeBaseCategoryGrid({
  initial,
  extra,
}: {
  initial: ReactNode;
  extra: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const extraId = useId();

  return (
    <>
      <div className="home-knowledge-grid kb-category-cards">{initial}</div>
      <div
        id={extraId}
        className="home-knowledge-grid kb-category-cards kb-category-cards--extra"
        hidden={!open}
      >
        {extra}
      </div>
      <div className="kb-category-toggle">
        <button
          type="button"
          className="btn btn--outline"
          aria-expanded={open}
          aria-controls={extraId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Show Less' : 'View All Categories'}
        </button>
      </div>
    </>
  );
}
