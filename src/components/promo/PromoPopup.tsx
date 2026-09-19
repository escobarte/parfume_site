import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getPromoPopupContent, PROMO_POPUP_TEXT_KEYS } from '@/lib/content/promoPopup'
import { PromoPopupClient } from './PromoPopupClient'

/**
 * Серверная обёртка попапа «первая скидка»: читает глобал и решает, нужен ли
 * попап вообще. Выключенный в админке попап не доезжает до браузера ни одним
 * байтом — клиентский компонент даже не рендерится.
 *
 * Здесь же собираются стандартные строки локали (`messages/<locale>.json`,
 * namespace `PromoPopup`) и отдаются резолверу последним звеном цепочки
 * «текущая локаль → ro → ru → en → стандартная строка». Пустые поля глобала в
 * любой локали — штатное состояние: незаполненный глобал даёт рабочий попап
 * на всех трёх языках.
 *
 * Процент подставляется здесь, на сервере, из того же поля глобала, которое
 * уходит в выданный промокод, — из тела запроса он не берётся нигде.
 */
export async function PromoPopup({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'PromoPopup' })

  // `t.raw`, а не `t`: стандартные строки содержат метку `{percent}`, и обычный
  // `t()` принял бы её за ICU-переменную и упал бы на «variable was not
  // provided». Подставляет процент резолвер — одним правилом и для
  // редакторского текста, и для стандартного.
  const defaults = Object.fromEntries(
    PROMO_POPUP_TEXT_KEYS.map((key) => [key, String(t.raw(key === 'footerText' ? 'footer' : key))]),
  ) as Record<(typeof PROMO_POPUP_TEXT_KEYS)[number], string>

  const content = await getPromoPopupContent(locale, defaults)
  if (!content?.isEnabled) return null

  return <PromoPopupClient content={content} />
}
