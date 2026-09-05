import { getTranslations } from 'next-intl/server'
import { BrandMark } from '@/components/brand/BrandMark'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getNavigation, getSettings } from '@/lib/content/globals'
import { resolveLinkHref } from '@/lib/links'
import { LocaleSwitcher } from './LocaleSwitcher'

/**
 * Футер: 4 колонки 1.3fr / 1fr / 1fr / 1.1fr (WIREFRAMES.md §6).
 * Три колонки ссылок приходят из `navigation`, четвёртая — контакты из `settings`.
 */
export async function Footer({ locale }: { locale: Locale }) {
  const [navigation, settings, t] = await Promise.all([
    getNavigation(locale),
    getSettings(locale),
    getTranslations('Footer'),
  ])

  const columns = navigation.footerColumns ?? []
  const contacts = settings.contacts
  const messengers = [
    settings.messengers?.telegram && 'Telegram',
    settings.messengers?.viber && 'Viber',
    settings.messengers?.whatsapp && 'WhatsApp',
  ].filter(Boolean)

  return (
    <footer className="bg-navy mt-auto px-5 pt-13 pb-8 md:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="border-line-on-dark-soft grid grid-cols-2 gap-8 border-b pb-9 md:grid-cols-[1.3fr_1fr_1fr_1.1fr]">
          <div className="col-span-2 md:col-span-1">
            <BrandMark className="text-cream mb-3 h-9 w-auto" />
            <div className="text-cream text-label tracking-brandline font-light uppercase">
              {settings.siteName ?? 'Mon Flacon'}
            </div>
            {settings.footerNote && (
              <p className="text-ink-on-dark-faint text-eyebrow leading-body mt-3 max-w-45 font-light">
                {settings.footerNote}
              </p>
            )}
          </div>

          {columns.map((column) => (
            <div key={column.id ?? column.title}>
              <div className="text-cream text-eyebrow tracking-display mb-3.5 uppercase">
                {column.title}
              </div>
              {(column.links ?? []).map((link) => (
                <Link
                  key={link.id ?? link.href}
                  href={link.href}
                  className="text-ink-on-dark-muted hover:text-cream text-link block py-1 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}

          <div>
            <div className="text-cream text-eyebrow tracking-display mb-3.5 uppercase">
              {t('contacts')}
            </div>
            {contacts?.address && (
              <p className="text-ink-on-dark-muted text-link py-1">{contacts.address}</p>
            )}
            {contacts?.phone && (
              <a
                href={`tel:${contacts.phone.replace(/\s/g, '')}`}
                className="text-ink-on-dark-muted hover:text-cream text-link block py-1 transition-colors"
              >
                {contacts.phone}
              </a>
            )}
            {messengers.length > 0 && (
              <p className="text-ink-on-dark-muted text-link py-1">{messengers.join(' · ')}</p>
            )}
            {contacts?.workingHours && (
              <p className="text-ink-on-dark-faint text-eyebrow py-1">{contacts.workingHours}</p>
            )}
            {/* «Отследить заказ» — системная ссылка, а не редакторский контент
                CMS, поэтому и подпись из messages/*.json, и место — в этой,
                всегда отрисовываемой колонке. Раньше пункт жил внутри
                columns.map() по индексу колонки «Покупателям»: стоило
                footerColumns остаться пустым (как на проде сейчас), и вход
                в отслеживание заказа пропадал с сайта целиком. */}
            <Link
              href={resolveLinkHref('orderLookup', null) ?? '/order'}
              className="text-ink-on-dark-muted hover:text-cream text-link mt-2 block py-1 underline underline-offset-4 transition-colors"
            >
              {t('trackOrder')}
            </Link>
          </div>
        </div>

        {/* Инфоблок «Обмен и возврат / Защита данных / Контакты» (фаза 11.1,
            задача 4) — перенесён сюда, тот же Footer.tsx, второй футер-
            компонент не заводился. «Обмен» переиспользует условие 14 дней
            уже опубликованное на /returns (Pages), не дублирует его как
            отдельный источник правды — просто короткая версия + ссылка.
            «Контакты» — те же settings.contacts, что и колонка выше, но
            компактно (телефон/email), другая колонка их не показывала. */}
        <div className="border-line-on-dark-soft grid grid-cols-1 gap-6 border-b py-7 sm:grid-cols-3">
          <div>
            <div className="text-cream text-eyebrow tracking-display mb-2 uppercase">
              {t('exchangeTitle')}
            </div>
            <p className="text-ink-on-dark-muted text-eyebrow leading-body">{t('exchangeText')}</p>
            <Link
              href="/returns"
              className="text-ink-on-dark-muted hover:text-cream text-eyebrow mt-1 inline-block underline underline-offset-4 transition-colors"
            >
              {t('exchangeLink')}
            </Link>
          </div>

          <div>
            <div className="text-cream text-eyebrow tracking-display mb-2 uppercase">
              {t('dataProtectionTitle')}
            </div>
            {/* ЧЕРНОВИК (фаза 11.1, задача 4): стандартный текст о защите
                персональных данных, юридически НЕ проверен и не согласован
                с владельцем/клиентом — заменить перед реальным запуском.
                См. docs/CHANGELOG.md, запись этой сессии. */}
            <p className="text-ink-on-dark-muted text-eyebrow leading-body">
              {t('dataProtectionText')}
            </p>
          </div>

          <div>
            <div className="text-cream text-eyebrow tracking-display mb-2 uppercase">
              {t('contacts')}
            </div>
            {contacts?.phone && (
              <a
                href={`tel:${contacts.phone.replace(/\s/g, '')}`}
                className="text-ink-on-dark-muted hover:text-cream text-eyebrow block py-0.5 transition-colors"
              >
                {contacts.phone}
              </a>
            )}
            {contacts?.email && (
              <a
                href={`mailto:${contacts.email}`}
                className="text-ink-on-dark-muted hover:text-cream text-eyebrow block py-0.5 transition-colors"
              >
                {contacts.email}
              </a>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-on-dark-faint text-eyebrow">
            © {new Date().getFullYear()} {settings.siteName ?? 'MON FLACON'} ·{' '}
            {settings.tagline ?? 'Perfumes for everyone'}
          </p>
          <div className="text-ink-on-dark-faint text-eyebrow flex items-center gap-4">
            <LocaleSwitcher />
            <span className="tracking-label">MDL</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
