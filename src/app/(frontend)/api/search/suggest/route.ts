import { NextResponse } from 'next/server'
import { routing, type Locale } from '@/i18n/routing'
import { suggest } from '@/lib/search/fts'

/** Автодополнение поиска — дёргается из шапки с дебаунсом 250 мс. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const term = (url.searchParams.get('q') ?? '').trim()
  const requested = url.searchParams.get('locale') ?? routing.defaultLocale
  const locale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as Locale)
    : routing.defaultLocale

  if (term.length < 2) return NextResponse.json({ items: [] })

  const items = await suggest(term, locale)
  return NextResponse.json({ items })
}
