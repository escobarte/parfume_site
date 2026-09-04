/**
 * Контакты внизу заглушки, отделены тонкой линией (BRAND.md §5: линии вместо
 * подложек). Телефон и почта кликабельны.
 *
 * Значения намеренно константами, а не из global `settings` Payload: заглушка
 * должна отвечать даже когда БД недоступна — именно в такие моменты она нужнее
 * всего. Телефон совпадает с футером витрины.
 *
 * Физический адрес сюда сознательно не выводится (правка клиента, фаза 9.2) —
 * это решение только для заглушки, страницы «Контакты»/JSON-LD LocalBusiness
 * не трогать.
 */
const PHONE = '+373 78 201 802'
const EMAIL = 'monflacon.md@gmail.com'

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
    </address>
  )
}
