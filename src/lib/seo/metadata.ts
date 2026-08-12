import type { Metadata } from 'next'
import type { Locale } from '@/i18n/routing'
import { localizedPaths, SITE_NAME } from './config'

export type SeoFields = {
  title?: string | null
  description?: string | null
  image?: { url: string } | null
}

/**
 * Общий генератор `Metadata` (фаза 7.1) — canonical + `alternates.languages`
 * (ro/ru/en + x-default) на любой путь, title/description с фолбэком
 * title→CMS `seo.title`, OpenGraph/Twitter. `path` — без префикса локали
 * (напр. `/catalog`, `/product/slug`, `''` для главной). Абсолютные URL
 * резолвятся через `metadataBase`, заданный в `[locale]/layout.tsx`.
 */
export function buildMetadata({
  locale,
  path,
  title,
  description,
  seo,
  image,
  noindex = false,
}: {
  locale: Locale
  path: string
  /** Заголовок по умолчанию, если `seo.title` не заполнен в CMS. */
  title: string
  description?: string | null
  seo?: SeoFields | null
  /** OG-картинка приоритетнее `seo.image` (напр. реальное фото товара). */
  image?: string | null
  noindex?: boolean
}): Metadata {
  const metaTitle = seo?.title || title
  const metaDescription = seo?.description || description || undefined
  // Реальное фото (товар) или CMS-картинка — приоритет; иначе брендованный
  // сгенерированный fallback (og-image/route.tsx), но только для
  // индексируемых страниц — noindex-экраны (корзина/поиск/заказ) делиться
  // в соцсетях не предполагаются, лишний рендер ни к чему.
  const ogImage =
    image ?? seo?.image?.url ?? (noindex ? undefined : `/${locale}/og-image?title=${encodeURIComponent(metaTitle)}`)

  return {
    title: metaTitle,
    description: metaDescription,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: localizedPaths(path),
    },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      url: `/${locale}${path}`,
      siteName: SITE_NAME,
      locale,
      type: 'website',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: metaTitle,
      description: metaDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}
