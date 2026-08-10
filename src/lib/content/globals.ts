import { unstable_cache } from 'next/cache'
import { CACHE_TTL } from '@/lib/cache'
import type { Locale } from '@/i18n/routing'
import { getPayloadClient } from '@/lib/payload'
import { GLOBALS_TAG, HOMEPAGE_TAG } from '@/lib/revalidate'

export const getSettings = (locale: Locale) =>
  unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      return payload.findGlobal({ slug: 'settings', locale, depth: 0 })
    },
    ['settings', locale],
    { tags: [GLOBALS_TAG], revalidate: CACHE_TTL },
  )()

export const getNavigation = (locale: Locale) =>
  unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      return payload.findGlobal({ slug: 'navigation', locale, depth: 0 })
    },
    ['navigation', locale],
    { tags: [GLOBALS_TAG], revalidate: CACHE_TTL },
  )()

export const getHomepage = (locale: Locale) =>
  unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      return payload.findGlobal({ slug: 'homepage', locale, depth: 1 })
    },
    ['homepage', locale],
    { tags: [HOMEPAGE_TAG], revalidate: CACHE_TTL },
  )()
