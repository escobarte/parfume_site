import type { Locale } from '@/i18n/routing'
import { getNavigation, getSettings } from '@/lib/content/globals'
import { resolveInternalLink } from '@/lib/links'
import { HeaderShell, type NavLink } from './HeaderShell'

/**
 * Меню шапки редактируется в global `navigation` (WIREFRAMES.md §Привязка
 * к данным). Ссылки — двойной механизм «системная цель ИЛИ страница» +
 * override (`internalLinkFields`, фаза 4.6.4, апгрейд на relationship —
 * фаза 5.2, тот же механизм, что у промо-баннера/hero) вместо свободного
 * текста — так пункт «Новинки» не может снова разъехаться с реальным
 * query-парамом каталога (`flags=isNew`).
 */
export async function Header({ locale }: { locale: Locale }) {
  const [navigation, settings] = await Promise.all([getNavigation(locale), getSettings(locale)])

  const links: NavLink[] = (navigation.header ?? [])
    .map((item) => ({
      label: item.label,
      href: resolveInternalLink({
        mode: item.targetMode,
        target: item.target,
        page: typeof item.targetPage === 'object' ? item.targetPage : null,
        override: item.targetOverride,
      }),
    }))
    .filter((item): item is NavLink => Boolean(item.label && item.href))

  // Телефон — тот же `settings.contacts.phone`, что в футере: один источник,
  // номер меняется в админке, а не в коде.
  return <HeaderShell links={links} phone={settings.contacts?.phone ?? null} />
}
