import Link from 'next/link';

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  recoveryHref: string;
  recoveryLabel: string;
  retry?: boolean;
  headingLevel?: 'h1' | 'h2';
};

export function PublicContentState({
  eyebrow,
  title,
  description,
  recoveryHref,
  recoveryLabel,
  retry = false,
  headingLevel = 'h2',
}: Props) {
  return (
    <section
      className="public-content-state"
      role="status"
      aria-labelledby="public-content-state-h"
    >
      <div className="public-content-state__inner container">
        <span className="eyebrow">{eyebrow}</span>
        {headingLevel === 'h1' ? (
          <h1 id="public-content-state-h">{title}</h1>
        ) : (
          <h2 id="public-content-state-h">{title}</h2>
        )}
        <p>{description}</p>
        {retry ? (
          <a className="btn btn--accent" href={recoveryHref}>
            {recoveryLabel}
          </a>
        ) : (
          <Link className="btn btn--outline" href={recoveryHref}>
            {recoveryLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
