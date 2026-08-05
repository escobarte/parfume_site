import type { Locale } from '@/i18n/routing'
import { getNavigation } from '@/lib/content/globals'
import { HeaderShell, type NavLink } from './HeaderShell'

/** Меню шапки редактируется в global `navigation` (WIREFRAMES.md §Привязка к данным). */
export async function Header({ locale }: { locale: Locale }) {
  const navigation = await getNavigation(locale)

  const links: NavLink[] = (navigation.header ?? [])
    .filter((item) => item.label && item.href)
    .map((item) => ({ label: item.label, href: item.href }))

  return <HeaderShell links={links} />
}
