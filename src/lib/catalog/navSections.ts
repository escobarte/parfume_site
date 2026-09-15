import { CATALOG_SECTIONS } from './sections'

/**
 * Левая навигационная колонка каталога (фаза 11.1, задача 1) — фиксированный
 * список разделов, не CMS-контент. Переиспользуется и десктопной колонкой
 * (`CatalogNavColumn`), и секцией «Каталог» мобильного меню шапки
 * (`HeaderShell`), поэтому список и переводы (namespace `CatalogNav`) —
 * общие, а не продублированы в двух местах. Товарные пункты — закрытые
 * разделы, пути берутся из `sections.ts`.
 */
export const CATALOG_NAV_ITEMS = [
  { key: 'forHer', href: CATALOG_SECTIONS.forHer.path },
  { key: 'forHim', href: CATALOG_SECTIONS.forHim.path },
  { key: 'kids', href: CATALOG_SECTIONS.kids.path },
  { key: 'bodyCare', href: CATALOG_SECTIONS.bodyCare.path },
  { key: 'lipBalm', href: CATALOG_SECTIONS.lipBalm.path },
  { key: 'giftCertificates', href: '/gift-certificates' },
  { key: 'giftBox', href: '/gift-box' },
  { key: 'brands', href: '/brands' },
  { key: 'about', href: '/about' },
] as const

export type CatalogNavKey = (typeof CATALOG_NAV_ITEMS)[number]['key']
