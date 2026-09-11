import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getPromoPopupSettings } from '@/lib/content/globals'
import { PromoPopupClient } from './PromoPopupClient'

/**
 * Серверная обёртка попапа «первая скидка»: читает глобал и решает, нужен ли
 * попап вообще. Выключенный в админке попап не доезжает до браузера ни одним
 * байтом — клиентский компонент даже не рендерится.
 *
 * Пустые `title`/`footerText` в локали — не ошибка: подставляется стандартный
 * текст из `messages/<locale>.json`, так что незаполненный глобал даёт
 * рабочий попап на всех трёх языках.
 */
export async function PromoPopup({ locale }: { locale: Locale }) {
  const [settings, t] = await Promise.all([
    getPromoPopupSettings(locale),
    getTranslations({ locale, namespace: 'PromoPopup' }),
  ])

  if (!settings?.isEnabled) return null

  return (
    <PromoPopupClient
      title={settings.title?.trim() || t('title')}
      percent={settings.discountPercent}
      footerText={settings.footerText?.trim() || t('footer')}
      requirePhone={settings.requirePhone !== false}
    />
  )
}
