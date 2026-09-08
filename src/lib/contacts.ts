/**
 * Ссылки для контактных данных из global `settings`.
 * Значения там — свободный текст, который заполняет владелец в админке
 * (телефон с пробелами, телеграм с «@» или без, вайбер/ватсап номером),
 * поэтому href собирается здесь, а не в компоненте: разметка футера должна
 * остаться тупой.
 */

/** Только цифры и ведущий «+» — из телефона в любом человеческом написании. */
const digits = (value: string) => value.replace(/[^\d]/g, '')

export const telHref = (phone: string) => `tel:${phone.replace(/\s/g, '')}`

export const mailHref = (email: string) => `mailto:${email}`

/**
 * Карта: если владелец задал `contacts.mapUrl` — ведём туда (он мог поставить
 * точную точку на любом сервисе). Если поле пустое — поиск по адресу в Google
 * Maps, чтобы ссылка работала и без ручной настройки.
 */
export const mapHref = (address: string, mapUrl?: string | null) =>
  mapUrl?.trim()
    ? mapUrl.trim()
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

export type MessengerLink = { key: 'telegram' | 'viber' | 'whatsapp'; label: string; href: string }

/** Значение уже похоже на готовую ссылку — берём как есть, ничего не достраиваем. */
const isUrl = (value: string) => /^https?:\/\//i.test(value)

/**
 * Мессенджеры. В админке это три текстовых поля без формата, поэтому
 * поддерживаем оба варианта записи: имя пользователя/номер или сразу ссылка.
 * Viber — фирменная схема `viber://`, у него нет веб-версии диалога.
 */
export function messengerLinks(messengers?: {
  telegram?: string | null
  viber?: string | null
  whatsapp?: string | null
}): MessengerLink[] {
  const links: MessengerLink[] = []
  if (!messengers) return links

  const telegram = messengers.telegram?.trim()
  if (telegram) {
    links.push({
      key: 'telegram',
      label: 'Telegram',
      href: isUrl(telegram) ? telegram : `https://t.me/${telegram.replace(/^@/, '')}`,
    })
  }

  const viber = messengers.viber?.trim()
  if (viber) {
    links.push({
      key: 'viber',
      label: 'Viber',
      href: isUrl(viber) ? viber : `viber://chat?number=${encodeURIComponent(`+${digits(viber)}`)}`,
    })
  }

  const whatsapp = messengers.whatsapp?.trim()
  if (whatsapp) {
    links.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      href: isUrl(whatsapp) ? whatsapp : `https://wa.me/${digits(whatsapp)}`,
    })
  }

  return links
}
