import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/config'

/**
 * `/admin`/`/api` — служебные, закрыты всегда. Персональные/тонкие экраны
 * (`cart`/`search`/`order`/`thank-you`) уже помечены `noindex` через
 * `generateMetadata` (фаза 7.1) — этого достаточно, здесь их НЕ дублируем
 * `Disallow`: закрытая для краулинга страница не даёт роботу увидеть её
 * же noindex-тег, что может парадоксально оставить URL в индексе без
 * сниппета, если на него где-то есть внешняя ссылка. По той же причине
 * отфильтрованный `/catalog?...` тоже не блокируется здесь — только noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
