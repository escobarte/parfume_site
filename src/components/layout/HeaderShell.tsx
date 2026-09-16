'use client'

import { ChevronDown, Menu, Phone, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { telHref } from '@/lib/contacts'
import { useScrolled } from '@/lib/useScrolled'
import { Link, usePathname } from '@/i18n/navigation'
import { CartLink } from '@/components/cart/CartLink'
import { CATALOG_NAV_ITEMS } from '@/lib/catalog/navSections'
import { LocaleSwitcher } from './LocaleSwitcher'
import { SearchBox } from './SearchBox'
import { Wordmark } from './Wordmark'

export type NavLink = { label: string; href: string }

/**
 * Шапка по WIREFRAMES.md §Шапка и мокапу docs/mockups/mockup-home.html:
 * navy, нижняя граница 1px cream 25%, при скролле сжимается и оставляет
 * только знак. На <768 — знак + бургер + корзина, остальное в выезжающем меню.
 */
export function HeaderShell({ links, phone }: { links: NavLink[]; phone: string | null }) {
  const t = useTranslations('Nav')
  const tCatalogNav = useTranslations('CatalogNav')
  const pathname = usePathname()
  const compact = useScrolled()

  // Смена страницы закрывает всё, что открыто поверх. Храним путь, на котором
  // панель открыли, — так состояние вычисляется, а не сбрасывается эффектом
  // (эффект с setState вызывал бы лишний каскадный рендер).
  const [menu, setMenu] = useState({ open: false, at: pathname })
  const [search, setSearch] = useState({ open: false, at: pathname })
  // Подсписок каталога в мобильном меню — аккордеон, по умолчанию свёрнут
  // (правка 16.09: раньше он всегда висел развёрнутым под верхним списком).
  const [catalogOpen, setCatalogOpen] = useState(false)
  const menuOpen = menu.open && menu.at === pathname
  const searchOpen = search.open && search.at === pathname
  const setMenuOpen = (open: boolean) => {
    setMenu({ open, at: pathname })
    if (!open) setCatalogOpen(false)
  }
  const setSearchOpen = (open: boolean) => setSearch({ open, at: pathname })

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  return (
    <header className="bg-navy border-line-on-dark sticky top-0 z-50 border-b">
      <div
        className={`mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 transition-all md:px-8 ${
          compact ? 'py-3' : 'py-4 md:py-5'
        }`}
      >
        <div className="flex min-w-0 shrink items-center gap-3">
          <button
            type="button"
            className="text-cream md:hidden"
            aria-label={t('menu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <X className="size-5" strokeWidth={1.6} />
            ) : (
              <Menu className="size-5" strokeWidth={1.6} />
            )}
          </button>
          <Wordmark compact={compact} />
        </div>

        <nav className="hidden min-w-0 items-center gap-5 md:flex lg:gap-7">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-cream hover:text-ink-on-dark-muted text-label tracking-display uppercase transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4 md:gap-5">
          <button
            type="button"
            className="text-cream hover:text-ink-on-dark-muted transition-colors"
            aria-label={t('search')}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            {searchOpen ? (
              <X className="size-[17px]" strokeWidth={1.6} />
            ) : (
              <Search className="size-[17px]" strokeWidth={1.6} />
            )}
          </button>
          {/* Телефон — только широкий десктоп (xl+): на md/lg номер выдавливает
              «Despre noi» на две строки, под мобильную шапку (бургер) разметки нет —
              решение за владельцем (см. GOTCHAS.md). Иконка — акцент cream,
              как подчёркивание активной локали. */}
          {phone && (
            <a
              href={telHref(phone)}
              className="text-cream hover:text-ink-on-dark-muted text-label hidden items-center gap-1.5 whitespace-nowrap transition-colors xl:flex"
            >
              <Phone className="text-cream size-[15px]" strokeWidth={1.6} aria-hidden="true" />
              {phone}
            </a>
          )}
          <LocaleSwitcher className="hidden sm:flex" />
          {/* <1280 — только иконка-трубка у корзины: номер текстом не влезает
              (см. GOTCHAS.md), ссылка та же, что у десктопной версии. */}
          {phone && (
            <a
              href={telHref(phone)}
              aria-label={`${t('call')}: ${phone}`}
              className="hover:text-ink-on-dark-muted transition-colors xl:hidden"
            >
              <Phone className="text-cream size-[17px]" strokeWidth={1.6} aria-hidden="true" />
            </a>
          )}
          <CartLink />
        </div>
      </div>

      {searchOpen && (
        <div className="border-line-on-dark bg-navy border-t px-5 py-4 md:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SearchBox autoFocus onClose={() => setSearchOpen(false)} />
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="border-line-on-dark bg-navy border-t md:hidden">
          <nav className="divide-line-on-dark-soft flex flex-col divide-y px-5">
            {links.map((link) =>
              // Пункт «Каталог» раскрывает подсписок разделов, а не ведёт на
              // страницу: правка владельца 16.09. Определяем его по адресу, а
              // не по подписи — подпись редактируется в админке на трёх языках.
              link.href === '/catalog' ? (
                <div key={link.href}>
                  <button
                    type="button"
                    onClick={() => setCatalogOpen(!catalogOpen)}
                    aria-expanded={catalogOpen}
                    className="text-cream text-label tracking-display flex w-full cursor-pointer items-center justify-between py-4 uppercase"
                  >
                    {link.label}
                    <ChevronDown
                      className={`size-4 transition-transform ${catalogOpen ? 'rotate-180' : ''}`}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </button>
                  {/* Разделы каталога — фиксированный список (фаза 11.1, задача 1),
                      тот же CATALOG_NAV_ITEMS, что у десктопной левой колонки
                      (`CatalogNavColumn`), см. `navSections.ts`. «О нас» отсюда
                      исключён — он уже есть отдельным пунктом верхнего списка. */}
                  {catalogOpen && (
                    <nav
                      aria-label={tCatalogNav('mobileHeading')}
                      className="divide-line-on-dark-soft border-line-on-dark-soft flex flex-col divide-y border-t pl-4"
                    >
                      {/* Первым пунктом — сам общий каталог: пункт верхнего
                          списка стал переключателем аккордеона и на страницу
                          больше не ведёт (правка 17.09). Адрес тот же, что
                          у него, — из CMS-ссылки, не захардкожен. */}
                      <Link
                        href={link.href}
                        className="text-cream text-label tracking-display py-4 uppercase"
                      >
                        {tCatalogNav('allProducts')}
                      </Link>
                      {CATALOG_NAV_ITEMS.filter((item) => item.key !== 'about').map((item) => (
                        <Link
                          key={item.key}
                          href={item.href}
                          className="text-cream text-label tracking-display py-4 uppercase"
                        >
                          {tCatalogNav(item.key)}
                        </Link>
                      ))}
                    </nav>
                  )}
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-cream text-label tracking-display py-4 uppercase"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
          <div className="border-line-on-dark-soft border-t px-5 py-4">
            <LocaleSwitcher />
          </div>
        </div>
      )}
    </header>
  )
}
