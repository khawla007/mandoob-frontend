import Link from 'next/link';

export function SetupConversionBand({
  headingId,
  title,
  description,
  estimateHref,
}: {
  headingId: string;
  title: string;
  description: string;
  estimateHref: string;
}) {
  return (
    <div className="container setup-conversion__inner">
      <div>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="cta-row">
        <Link className="btn btn--light btn--lg" href={estimateHref}>
          Calculate indicative cost
        </Link>
        <Link className="btn btn--light btn--lg" href="/apply">
          Start application
        </Link>
      </div>
    </div>
  );
}
