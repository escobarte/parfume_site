import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { CATALOG_NAV_ITEMS, type CatalogNavKey } from '@/lib/catalog/navSections'

/**
 * Левая колонка навигации по разделам каталога (фаза 11.1, задача 1; вынесена
 * в постоянный `CatalogShell` — ПРОМПТ 13, задача 2) — НЕ фильтр и не замена
 * `FiltersDrawer`, тот остаётся попапом по кнопке «Фильтр». Видна на десктопе
 * (`lg:`, тот же порог, что у геометрии дровера в FiltersDrawer.tsx) на всех
 * восьми пунктах меню, не на главной. На мобильном пункты уходят в секцию
 * «Каталог» гамбургер-меню шапки (`HeaderShell.tsx`) — переиспользуют тот же
 * `CATALOG_NAV_ITEMS`.
 */
export async function CatalogNavColumn({
  gender = [],
  activeKey,
}: {
  // Подсветка «Для неё/него/Детям» по активному фасету «Кому» — только
  // страницы каталога передают это (у gift-items/brands/about такого фасета
  // нет, они подсвечиваются через явный activeKey).
  gender?: string[]
  activeKey?: CatalogNavKey
}) {
  const t = await getTranslations('CatalogNav')

  const isActive = (key: CatalogNavKey) => {
    if (key === 'forHer') return gender.includes('female')
    if (key === 'forHim') return gender.includes('male')
    if (key === 'kids') return gender.includes('kids')
    return key === activeKey
  }

  return (
    <nav aria-label={t('title')} className="hidden shrink-0 lg:block lg:w-56">
      <ul className="border-line border-t">
        {CATALOG_NAV_ITEMS.map((item) => {
          const active = isActive(item.key)
          return (
            <li key={item.key} className="border-line border-b">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block border-l-2 py-3 pr-2 pl-4 text-body transition-colors ${
                  active
                    ? 'border-ink text-ink font-medium'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {t(item.key)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
