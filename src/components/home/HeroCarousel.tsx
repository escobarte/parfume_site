import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getHeroBanners } from '@/lib/content/heroBanners'
import { HeroBannerSlide } from './HeroBannerSlide'
import { HeroCarouselClient } from './HeroCarouselClient'

/**
 * Первый экран главной — баннеры из `homepage.heroBanners` (2026-09-14,
 * заменили статичный hero, акционный hero по датам и editorial-блок).
 *
 * Нет включённых баннеров с картинкой — секции нет вовсе (как у ленты
 * категорий). Один — статичная картинка, отрендеренная сервером, без JS
 * карусели и без индикаторов. Два и больше — клиентская карусель.
 */
export async function HeroCarousel({ locale }: { locale: Locale }) {
  const [banners, t] = await Promise.all([
    getHeroBanners(locale),
    getTranslations('HomePage.banners'),
  ])
  if (banners.length === 0) return null

  if (banners.length === 1) {
    return (
      <section aria-label={t('label')} className="bg-navy">
        <HeroBannerSlide banner={banners[0]} priority />
      </section>
    )
  }

  return (
    <HeroCarouselClient
      banners={banners}
      label={t('label')}
      slideLabels={banners.map((_, index) => t('goTo', { index: index + 1 }))}
    />
  )
}
