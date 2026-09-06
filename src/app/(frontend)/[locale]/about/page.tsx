import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { StaticPage } from '@/components/pages/StaticPage'
import type { Locale } from '@/i18n/routing'
import { getSettings } from '@/lib/content/globals'
import { staticPageMetadata } from '@/lib/content/pages'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
  const { locale } = await props.params
  return staticPageMetadata(locale, 'about')
}

/**
 * «О нас» (ПРОМПТ 13, задача 3) — контакты и карта под текстом страницы
 * читаются из global `settings.contacts` (тот же источник, что и футер), не
 * дублируются как отдельный хардкод: изменит владелец телефон/адрес в
 * админке — обновится и здесь. Карта — Google Maps Embed без ключа/биллинга
 * (`?output=embed`), построена из текущего адреса; в проекте нет CSP
 * (`Content-Security-Policy` нигде не настроен), поэтому исключений под
 * `frame-src` заводить не пришлось — блокировать iframe нечему.
 */
export default async function AboutPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [t, settings] = await Promise.all([
    getTranslations('AboutPage'),
    getSettings(locale),
  ])
  const contacts = settings.contacts
  const hasContacts = Boolean(contacts?.phone || contacts?.email || contacts?.address)

  return (
    <StaticPage locale={locale} slug="about" activeNavKey="about">
      {hasContacts && (
        <section className="border-line mt-10 border-t pt-8">
          <h2 className="text-ink text-section tracking-display font-light uppercase">
            {t('contactsHeading')}
          </h2>
          <address className="mt-4 flex flex-col gap-1 not-italic">
            {contacts?.phone && (
              <a
                href={`tel:${contacts.phone.replace(/\s/g, '')}`}
                className="text-ink hover:text-ink-muted text-body-sm w-fit transition-colors"
              >
                {contacts.phone}
              </a>
            )}
            {contacts?.email && (
              <a
                href={`mailto:${contacts.email}`}
                className="text-ink hover:text-ink-muted text-body-sm w-fit transition-colors"
              >
                {contacts.email}
              </a>
            )}
            {contacts?.address && (
              <p className="text-ink-muted text-body-sm">{contacts.address}</p>
            )}
          </address>

          {contacts?.address && (
            <div className="border-line mt-6 aspect-video w-full overflow-hidden border">
              <iframe
                src={`https://www.google.com/maps?q=${encodeURIComponent(contacts.address)}&output=embed`}
                title={t('mapTitle')}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full"
              />
            </div>
          )}
        </section>
      )}
    </StaticPage>
  )
}
