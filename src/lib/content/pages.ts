import { unstable_cache } from 'next/cache'
import type { Locale } from '@/i18n/routing'
import { CACHE_TTL } from '@/lib/cache'
import { getPayloadClient } from '@/lib/payload'
import { GLOBALS_TAG } from '@/lib/revalidate'
import type { Page } from '@/payload-types'

/** Статическая страница по фиксированному slug (LINK_TARGETS: about/delivery/contacts + returns). */
export const getPageBySlug = (locale: Locale, slug: string): Promise<Page | null> =>
  unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      const { docs } = await payload.find({
        collection: 'pages',
        locale,
        depth: 1,
        limit: 1,
        where: { slug: { equals: slug } },
      })
      return docs[0] ?? null
    },
    ['page', locale, slug],
    { tags: [GLOBALS_TAG], revalidate: CACHE_TTL },
  )()
