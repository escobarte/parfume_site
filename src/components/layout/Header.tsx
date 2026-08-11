import type { Locale } from '@/i18n/routing'
import { getNavigation } from '@/lib/content/globals'
import { resolveLinkHref } from '@/lib/links'
import { HeaderShell, type NavLink } from './HeaderShell'

/**
 * Меню шапки редактируется в global `navigation` (WIREFRAMES.md §Привязка
 * к данным). Ссылки — select+override (`internalLinkFields`, фаза 4.6.4,
 * тот же механизм, что у промо-баннера/hero) вместо свободного текста —
 * так пункт «Новинки» не может снова разъехаться с реальным query-парамом
 * каталога (`flags=isNew`).
 */
export async function Header({ locale }: { locale: Locale }) {
  const navigation = await getNavigation(locale)

  const links: NavLink[] = (navigation.header ?? [])
    .map((item) => ({ label: item.label, href: resolveLinkHref(item.target, item.targetOverride) }))
    .filter((item): item is NavLink => Boolean(item.label && item.href))

  return <HeaderShell links={links} />
}
