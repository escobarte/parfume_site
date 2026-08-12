import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getSettings } from '@/lib/content/globals'
import { resolveInternalLink } from '@/lib/links'
import { isWithinWindow } from '@/lib/promo'
import { PromoBannerClient } from './PromoBannerClient'

/**
 * Полоса над шапкой (PLAN.md §4.5): решение «показывать или нет» принимается
 * на сервере по датам — до startDate и после endDate ничего не рендерится
 * вовсе (не просто скрыто CSS), так что скрытый баннер не занимает места
 * и не может мигнуть при загрузке.
 */
export async function PromoBanner({ locale }: { locale: Locale }) {
  const [settings, t, tLinkTargets] = await Promise.all([
    getSettings(locale),
    getTranslations('PromoBar'),
    getTranslations('LinkTargets'),
  ])
  const banner = settings.promoBanner

  const active = Boolean(banner?.enabled) && Boolean(banner?.text) && isWithinWindow(banner ?? {})
  if (!active || !banner?.text) return null

  const linkPage = typeof banner.linkTargetPage === 'object' ? banner.linkTargetPage : null
  const linkHref = resolveInternalLink({
    mode: banner.linkTargetMode,
    target: banner.linkTarget,
    page: linkPage,
    override: banner.linkTargetOverride,
  })
  const linkLabel =
    banner.linkLabel ||
    (banner.linkTargetMode === 'page'
      ? (linkPage?.title ?? null)
      : banner.linkTarget
        ? tLinkTargets(banner.linkTarget)
        : null)

  return (
    <PromoBannerClient
      text={banner.text}
      linkLabel={linkLabel}
      linkHref={linkHref}
      closeLabel={t('close')}
    />
  )
}
