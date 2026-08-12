import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BrandStrip } from '@/components/home/BrandStrip'
import { CategoryRibbon } from '@/components/home/CategoryRibbon'
import { Editorial } from '@/components/home/Editorial'
import { Hero } from '@/components/home/Hero'
import { ProductRow } from '@/components/home/ProductRow'
import type { Locale } from '@/i18n/routing'
import { getHomepage } from '@/lib/content/globals'

/**
 * Главная (WIREFRAMES.md §Главная, мокап docs/mockups/mockup-home.html):
 * Hero → Лента категорий → Новинки → Editorial → Бренд-строка →
 * [опц. Хиты]. Порядок секций фиксирован вёрсткой, наполнение — из global
 * `homepage` (Payload).
 */
export default async function HomePage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const [homepage, t] = await Promise.all([getHomepage(locale), getTranslations('HomePage')])
  const hitsRow = homepage.hitsRow

  return (
    <>
      <Hero locale={locale} />
      <CategoryRibbon locale={locale} />
      <ProductRow
        locale={locale}
        flag="isNew"
        title={homepage.newRow?.title || t('rows.newTitle')}
        linkLabel={homepage.newRow?.linkLabel}
        limit={homepage.newRow?.limit ?? 4}
        priority
      />
      <Editorial locale={locale} />
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
