import type { CatalogScope } from './queries'

/**
 * Закрытые товарные разделы левого меню (2026-09-15). Область выдачи задаёт
 * маршрут (scope), а не query-параметр: какие бы фильтры пользователь ни
 * менял внутри раздела, из него он не выходит. Раньше «For Her/Him/Kids» были
 * ссылками на `/catalog?gender=…` — фасетом общего каталога.
 *
 * Разделы взаимоисключающие: пол-разделы берут только `perfume`, поэтому
 * женский уход за телом живёт только в «Body Care», бальзам — только в
 * «Lip balm». `unisex` осознанно не входит ни в один раздел — доступен только
 * фасетом «Кому» общего `/catalog` (решение владельца).
 *
 * `hideGenderFacet` — раздел сам определяет пол: фасета «Кому» в фильтрах нет,
 * `gender` из URL игнорируется. У Body Care / Lip balm пол остаётся обычным
 * фильтром внутри раздела.
 *
 * Файл без рантайм-импортов: его тянет `navSections.ts`, а тот — клиентская
 * шапка.
 */
type CatalogSection = {
  path: string
  scope: CatalogScope
  hideGenderFacet: boolean
}

export const CATALOG_SECTIONS = {
  forHer: {
    path: '/catalog/for-her',
    scope: { gender: 'female', productCategory: 'perfume' },
    hideGenderFacet: true,
  },
  forHim: {
    path: '/catalog/for-him',
    scope: { gender: 'male', productCategory: 'perfume' },
    hideGenderFacet: true,
  },
  kids: {
    path: '/catalog/kids',
    scope: { gender: 'kids', productCategory: 'perfume' },
    hideGenderFacet: true,
  },
  bodyCare: {
    path: '/catalog/body-care',
    scope: { productCategory: 'bodyCare' },
    hideGenderFacet: false,
  },
  lipBalm: {
    path: '/catalog/lip-balm',
    scope: { productCategory: 'lipBalm' },
    hideGenderFacet: false,
  },
} as const satisfies Record<string, CatalogSection>

export type CatalogSectionKey = keyof typeof CATALOG_SECTIONS
