import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BrandStrip } from '@/components/home/BrandStrip'
import { CategoryRibbon } from '@/components/home/CategoryRibbon'
import { HeroCarousel } from '@/components/home/HeroCarousel'
import { ProductRow } from '@/components/home/ProductRow'
import type { Locale } from '@/i18n/routing'
import { getHomepage, getSettings } from '@/lib/content/globals'

/**
 * Главная (WIREFRAMES.md §Главная):
 * Карусель баннеров → Лента категорий → Новинки → Бренд-строка → [опц. Хиты].
 * Порядок секций фиксирован вёрсткой, наполнение — из global `homepage`.
 *
 * С 2026-09-14 текст первого экрана вшит в картинки баннеров, видимого
 * заголовка на странице нет. `h1` остаётся — визуально скрытым, из названия
 * и дескриптора сайта: у страницы должен быть заголовок первого уровня и для
 * поисковиков, и для навигации скринридером.
 */
export default async function HomePage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [homepage, settings, t] = await Promise.all([
    getHomepage(locale),
    getSettings(locale),
    getTranslations('HomePage'),
  ])
  const hitsRow = homepage.hitsRow

  return (
    <>
      <h1 className="sr-only">
        {[settings.siteName || 'MON FLACON', settings.tagline].filter(Boolean).join(' — ')}
      </h1>
      <HeroCarousel locale={locale} />
      <CategoryRibbon locale={locale} />
      <ProductRow
        locale={locale}
        flag="isNew"
        title={homepage.newRow?.title || t('rows.newTitle')}
        linkLabel={homepage.newRow?.linkLabel}
        limit={homepage.newRow?.limit ?? 4}
        priority
      />
      <BrandStrip locale={locale} />
      {hitsRow?.enabled && (
        <ProductRow
          locale={locale}
          flag="isHit"
          title={hitsRow.title || t('rows.hitsTitle')}
          linkLabel={hitsRow.linkLabel}
          limit={hitsRow.limit ?? 4}
        />
      )}
    </>
  )
}
