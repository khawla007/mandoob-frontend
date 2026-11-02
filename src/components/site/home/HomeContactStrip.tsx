import { MessageCircle, Phone, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const PHONE_DISPLAY = '+971 4 555 0123';
const PHONE_E164 = '+97145550123';

/** Three-up contact card that overlaps the bottom of the final CTA section. */
export async function HomeContactStrip() {
  const t = await getTranslations('home.contactStrip');

  return (
    <section className="home-contact-strip" aria-labelledby="contact-strip-h">
      <h2 id="contact-strip-h" className="visually-hidden">
        {t('heading')}
      </h2>
      <div className="container">
        <ul className="home-contact-strip__card" role="list">
          <li>
            <span className="home-contact-strip__icon">
              <UsersRound aria-hidden="true" />
            </span>
            <div>
              <h3>{t('readyTitle')}</h3>
              <p>{t('readyText')}</p>
              <Link className="btn btn--accent btn--sm" href="/apply">
                {t('readyCta')} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </li>
          <li>
            <span className="home-contact-strip__icon home-contact-strip__icon--whatsapp">
              <MessageCircle aria-hidden="true" />
            </span>
            <div>
              <h3>{t('whatsappTitle')}</h3>
              <p>{t('whatsappText')}</p>
              <a
                className="btn btn--outline btn--sm"
                href={`https://wa.me/${PHONE_E164.slice(1)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('whatsappCta')}
              </a>
            </div>
          </li>
          <li>
            <span className="home-contact-strip__icon">
              <Phone aria-hidden="true" />
            </span>
            <div>
              <h3>{t('callTitle')}</h3>
              <p>{t('callText')}</p>
              <a
                className="btn btn--accent btn--sm"
                href={`tel:${PHONE_E164}`}
                aria-label={t('callLabel', { phone: PHONE_DISPLAY })}
              >
                <bdi>{PHONE_DISPLAY}</bdi>
              </a>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
