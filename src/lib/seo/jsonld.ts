import type { ProductView } from '@/lib/catalog/product'
import type { Locale } from '@/i18n/routing'
import type { Setting } from '@/payload-types'
import { SITE_NAME, SITE_URL } from './config'

const abs = (locale: Locale, path: string) => `${SITE_URL}/${locale}${path}`
/** Media-URL от Payload может быть относительным (локальный диск в dev) — JSON-LD требует абсолютный. */
const absMedia = (url: string) => (url.startsWith('http') ? url : `${SITE_URL}${url}`)

/** `Product` + `AggregateOffer` (PLAN.md §7.2) — диапазон цен MDL, наличие. */
export function productJsonLd(product: ProductView, locale: Locale) {
  const prices = product.variants.map((v) => v.price)
  const lowPrice = product.minPrice ?? Math.min(...prices)
  const highPrice = product.maxPrice ?? Math.max(...prices)
  const image = product.images[0]?.full

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand.title } } : {}),
    ...(image ? { image: [absMedia(image)] } : {}),
    url: abs(locale, `/product/${product.slug}`),
    sku: product.variants[0]?.sku,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'MDL',
      lowPrice,
      highPrice,
      offerCount: product.variants.length,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: abs(locale, `/product/${product.slug}`),
    },
  }
}

/** `BreadcrumbList` — абсолютные URL по текущей локали. */
export function breadcrumbJsonLd(
  items: { label: string; href?: string }[],
  locale: Locale,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: abs(locale, item.href) } : {}),
    })),
  }
}

/** `Organization`/`LocalBusiness` — сайт-wide, адрес/часы из global `settings`. */
export function organizationJsonLd(settings: Setting, locale: Locale) {
  const contacts = settings.contacts
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: settings.siteName || SITE_NAME,
    url: abs(locale, ''),
    ...(contacts?.phone ? { telephone: contacts.phone } : {}),
    ...(contacts?.email ? { email: contacts.email } : {}),
    ...(contacts?.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: contacts.address,
            addressLocality: 'Chișinău',
            addressCountry: 'MD',
          },
        }
      : {}),
    ...(contacts?.workingHours ? { openingHours: contacts.workingHours } : {}),
  }
}
