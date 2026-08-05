'use client'

import { Menu, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useScrolled } from '@/lib/useScrolled'
import { Link, usePathname } from '@/i18n/navigation'
import { CartButton } from './CartButton'
import { LocaleSwitcher } from './LocaleSwitcher'
import { SearchBox } from './SearchBox'
import { Wordmark } from './Wordmark'

export type NavLink = { label: string; href: string }

/**
 * Шапка по WIREFRAMES.md §Шапка и мокапу docs/mockups/mockup-home.html:
 * navy, нижняя граница 1px cream 25%, при скролле сжимается и оставляет
 * только знак. На <768 — знак + бургер + корзина, остальное в выезжающем меню.
 */
export function HeaderShell({ links }: { links: NavLink[] }) {
  const t = useTranslations('Nav')
  const pathname = usePathname()
  const compact = useScrolled()

  // Смена страницы закрывает всё, что открыто поверх. Храним путь, на котором
  // панель открыли, — так состояние вычисляется, а не сбрасывается эффектом
  // (эффект с setState вызывал бы лишний каскадный рендер).
  const [menu, setMenu] = useState({ open: false, at: pathname })
  const [search, setSearch] = useState({ open: false, at: pathname })
  const menuOpen = menu.open && menu.at === pathname
  const searchOpen = search.open && search.at === pathname
  const setMenuOpen = (open: boolean) => setMenu({ open, at: pathname })
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
          <LocaleSwitcher className="hidden sm:flex" />
          <CartButton />
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
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-cream text-label tracking-display py-4 uppercase"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="border-line-on-dark-soft border-t px-5 py-4">
            <LocaleSwitcher />
          </div>
        </div>
      )}
    </header>
  )
}
