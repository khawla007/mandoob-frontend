import Image from 'next/image';
import Link from 'next/link';
import { FREE_ZONE_DIRECTORY } from '@/lib/public-company-setup/catalog';
import { FreeZoneDirectory } from './FreeZoneDirectory';
import { SetupCtaBand } from './SetupCtaBand';

/**
 * `/free-zones/directory` — sub-page of Free Zones listing every zone, from the
 * design HTML `renderFreeZoneDirectory`: hero, "All Free Zones" filter table,
 * then a closing band.
 */
export function FreeZoneDirectoryPage() {
  return (
    <div className="setup-page offshore-page mainland-page free-zones-page free-zone-directory-page">
      <section
        id="setup-hero"
        className="offshore-hero"
        aria-labelledby="free-zone-directory-title"
      >
        <div className="offshore-hero__media" aria-hidden="true">
          <Image
            src="/company-setup/free-zone-hero.webp"
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 900px) 60vw, 100vw"
          />
        </div>
        <div className="offshore-hero__frame container">
          <nav className="setup-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <Link href="/business-registration">Business Registration</Link>
              </li>
              <li>
                <Link href="/free-zones">Free Zones</Link>
              </li>
              <li aria-current="page">Directory</li>
            </ol>
          </nav>
          <div className="offshore-hero__copy">
            <span className="eyebrow eyebrow--accent">Free zone directory</span>
            <h1 id="free-zone-directory-title" className="offshore-hero__title">
              Explore All UAE Free Zones
            </h1>
            <p>Search, filter and compare all 45+ free zones in one place.</p>
          </div>
        </div>
      </section>

      <section
        id="free-zone-directory"
        className="bizreg-section"
        aria-labelledby="free-zone-directory-all-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <span className="eyebrow eyebrow--accent">Browse &amp; compare</span>
            <h2 id="free-zone-directory-all-title">All Free Zones</h2>
            <p>{FREE_ZONE_DIRECTORY.length} jurisdictions available.</p>
          </header>
          <FreeZoneDirectory rows={FREE_ZONE_DIRECTORY} />
        </div>
      </section>

      <SetupCtaBand
        headingId="free-zone-directory-conversion-title"
        title="Need help choosing a free zone?"
        description="Our experts can recommend the right jurisdiction for your activity and budget."
        estimateHref="/estimate?jurisdiction=free_zone"
        primaryCta={{ label: 'Talk to an Expert', href: '/contact' }}
        secondaryCta={{ label: 'Calculate Cost', href: '/estimate?jurisdiction=free_zone' }}
      />
    </div>
  );
}
