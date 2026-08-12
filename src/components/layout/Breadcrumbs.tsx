import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { JsonLd } from '@/components/seo/JsonLd'
import type { Locale } from '@/i18n/routing'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'

export type Crumb = { label: string; href?: string }

/** Хлебные крошки: линия и типографика, без подложек (BRAND.md §5) + BreadcrumbList JSON-LD (фаза 7.2). */
export async function Breadcrumbs({ items }: { items: Crumb[] }) {
  const [t, locale] = await Promise.all([getTranslations('Nav'), getLocale()])

  const crumbs: Crumb[] = [{ label: t('home'), href: '/' }, ...items]

  return (
    <nav aria-label={t('breadcrumbs')} className="border-line border-b">
      <JsonLd data={breadcrumbJsonLd(crumbs, locale as Locale)} />
      <ol className="text-ink-muted text-eyebrow tracking-label mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-5 py-3 uppercase md:px-8">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">·</span>}
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="hover:text-ink transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={isLast ? 'text-ink' : undefined}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
