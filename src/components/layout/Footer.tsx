import { getTranslations } from 'next-intl/server'
import { BrandMark } from '@/components/brand/BrandMark'
import { mapHref, messengerLinks, telHref } from '@/lib/contacts'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getNavigation, getSettings } from '@/lib/content/globals'
import { resolveLinkHref } from '@/lib/links'
import { LocaleSwitcher } from './LocaleSwitcher'

/**
 * Футер: логотип + до трёх колонок ссылок (`navigation.footerColumns`,
 * необязательные, 0+) + контакты — в этом порядке (WIREFRAMES.md §6,
 * пропорции ширины 1.3 / 1 / 1 / 1.1 сохранены как flex-grow).
 *
 * Раньше это была ЖЁСТКАЯ CSS-сетка на 4 колонки (`grid-cols-[1.3fr_1fr_
 * 1fr_1.1fr]`) — при пустых `footerColumns` (реальный прод-кейс: владелец
 * почистил контент, колонки навигации ещё не завёл) в разметке всего 2
 * блока (лого + контакты), а сетка всё равно резервирует 4 трека — блоки
 * попадали в первые два, третий/четвёртый пустовали справа: контент
 * прижимался налево, будто «съехал». Flex + flex-wrap решает это без
 * привязки к числу колонок — что есть, то и распределяется по ширине
 * (0 колонок → 2 блока пополам, 2 колонки → как было раньше).
 */
export async function Footer({ locale }: { locale: Locale }) {
  const [navigation, settings, t] = await Promise.all([
    getNavigation(locale),
    getSettings(locale),
    getTranslations('Footer'),
  ])

  const columns = navigation.footerColumns ?? []
  const contacts = settings.contacts
  // Раньше здесь собирался просто список названий для вывода текстом —
  // теперь каждое название кликабельно, href строится в lib/contacts.ts.
  const messengers = messengerLinks(settings.messengers)

  return (
    <footer className="bg-navy mt-auto px-5 pt-13 pb-8 md:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="border-line-on-dark-soft flex flex-wrap gap-x-8 gap-y-9 border-b pb-9">
          <div className="min-w-56 flex-[1.3]">
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
            <div key={column.id ?? column.title} className="min-w-32 flex-1">
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

          <div className="min-w-44 flex-[1.1]">
            <div className="text-cream text-eyebrow tracking-display mb-3.5 uppercase">
              {t('contacts')}
            </div>
            {contacts?.address && (
              <a
                href={mapHref(contacts.address, contacts.mapUrl)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t('addressOnMap')}: ${contacts.address}`}
                className="text-ink-on-dark-muted hover:text-cream text-link block py-1 transition-colors"
              >
                {contacts.address}
              </a>
            )}
            {contacts?.phone && (
              <a
                href={telHref(contacts.phone)}
                className="text-ink-on-dark-muted hover:text-cream text-link block py-1 transition-colors"
              >
                {contacts.phone}
              </a>
            )}
            {/* Мессенджеры остаются одной строкой с разделителем «·», как были
                текстом, — меняется только то, что каждое название стало
                ссылкой (телега/вотсап — веб, вайбер — своя схема viber://). */}
            {messengers.length > 0 && (
              <p className="text-ink-on-dark-muted text-link py-1">
                {messengers.map((messenger, index) => (
                  <span key={messenger.key}>
                    {index > 0 && ' · '}
                    <a
                      href={messenger.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-cream transition-colors"
                    >
                      {messenger.label}
                    </a>
                  </span>
                ))}
              </p>
            )}
            {contacts?.workingHours && (
              <p className="text-ink-on-dark-muted text-link py-1">{contacts.workingHours}</p>
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

        {/* 2026-09-14: инфоблок «Обмен и возврат / Защита данных / Контакты»
            (фаза 11.1, задача 4) и статичная подпись «MDL» у переключателя
            языка удалены по решению владельца. «MDL» была просто текстом —
            валюта на сайте одна, переключения не было. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-on-dark-faint text-eyebrow">
            © {new Date().getFullYear()} {settings.siteName ?? 'MON FLACON'} ·{' '}
            {settings.tagline ?? 'Perfumes for everyone'}
          </p>
          <LocaleSwitcher />
        </div>
      </div>
    </footer>
  )
}
