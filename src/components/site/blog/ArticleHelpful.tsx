'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';

/**
 * "Was this article helpful?" from the design HTML. Feedback is acknowledged
 * on this device only; nothing is sent or stored.
 */
export function ArticleHelpful() {
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);

  return (
    <div className="blog-article__helpful">
      <p>Was this article helpful?</p>
      {answer ? (
        <p role="status" className="blog-article__helpful-thanks">
          {answer === 'yes'
            ? 'Thanks for letting us know.'
            : 'Thanks. Our team can help with questions this article does not cover.'}
        </p>
      ) : (
        <div className="blog-article__helpful-actions">
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => setAnswer('yes')}
          >
            <Check aria-hidden="true" size={16} /> Yes
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => setAnswer('no')}
          >
            Not yet
          </button>
        </div>
      )}
    </div>
  );
}
