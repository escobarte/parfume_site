/**
 * Контакты внизу заглушки, отделены тонкой линией (BRAND.md §5: линии вместо
 * подложек). Все три строки кликабельны: телефон, почта, адрес на Google Maps.
 *
 * Значения намеренно константами, а не из global `settings` Payload: заглушка
 * должна отвечать даже когда БД недоступна — именно в такие моменты она нужнее
 * всего. Совпадают с контактами в футере витрины.
 */
const PHONE = '+373 79 801 802'
const EMAIL = 'monflacon.md@gmail.com'
const ADDRESS = 'str. Mihail Kogălniceanu 46, Chișinău'

const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`

const LINK_CLASS =
  'text-ink-on-dark-muted hover:text-cream text-link block py-1 transition-colors'

export function MaintenanceContacts() {
  return (
    <address className="border-line-on-dark-soft mt-14 border-t pt-8 not-italic">
      <a href={`tel:${PHONE.replace(/\s/g, '')}`} className={LINK_CLASS}>
        {PHONE}
      </a>
      <a href={`mailto:${EMAIL}`} className={LINK_CLASS}>
        {EMAIL}
      </a>
      <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {ADDRESS}
      </a>
    </address>
  )
}
