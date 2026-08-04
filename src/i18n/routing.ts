import { defineRouting } from 'next-intl/routing'

export const locales = ['ro', 'ru', 'en'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'ro'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
})
