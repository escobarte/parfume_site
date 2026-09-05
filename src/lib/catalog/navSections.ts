/**
 * Левая навигационная колонка каталога (фаза 11.1, задача 1) — фиксированный
 * список разделов, не CMS-контент. Переиспользуется и десктопной колонкой
 * (`CatalogNavColumn`), и секцией «Каталог» мобильного меню шапки
 * (`HeaderShell`), поэтому список и переводы (namespace `CatalogNav`) —
 * общие, а не продублированы в двух местах.
 */
export const CATALOG_NAV_ITEMS = [
  { key: 'forHer', href: '/catalog?gender=female' },
  { key: 'forHim', href: '/catalog?gender=male' },
  { key: 'bodyCare', href: '/catalog/body-care' },
  { key: 'kids', href: '/catalog?gender=kids' },
  { key: 'giftCertificates', href: '/gift-certificates' },
  { key: 'giftBox', href: '/gift-box' },
  { key: 'brands', href: '/brands' },
  { key: 'about', href: '/about' },
] as const

export type CatalogNavKey = (typeof CATALOG_NAV_ITEMS)[number]['key']
