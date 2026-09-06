import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { CatalogShell } from '@/components/catalog/CatalogShell'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import type { CatalogNavKey } from '@/lib/catalog/navSections'
import { getPageBySlug } from '@/lib/content/pages'

/**
 * Статическая страница из коллекции `pages` (фаза 5.2) — общий рендер для
 * всех системных страниц (О нас/Доставка/Возврат/Контакты): заголовок +
 * richText-тело. Контент полностью из админки, композиция — общий паттерн
 * сайта (хлебные крошки + светлый контейнер), отдельного макета не утверждено.
 *
 * `activeNavKey` (ПРОМПТ 13, задача 2) — только для «О нас», единственной
 * из этих страниц, входящей в левое меню каталога (`CatalogShell`);
 * Доставка/Возврат/Контакты остаются без него, обёртка не меняется.
 *
 * `children` — доп. блок после richText-тела, сейчас нужен только «О нас»
 * (контакты + карта, ПРОМПТ 13, задача 3), остальные страницы его не передают.
 */
export async function StaticPage({
  locale,
  slug,
  activeNavKey,
  children,
}: {
  locale: Locale
  slug: string
  activeNavKey?: CatalogNavKey
  children?: ReactNode
}) {
  const page = await getPageBySlug(locale, slug)
  if (!page) notFound()

  const body = (
    <>
      <h1 className="text-ink text-section tracking-display font-light uppercase">
        {page.title}
      </h1>
      {page.body ? (
        <div className="text-ink text-body-sm leading-body mt-6">
          <RichText data={page.body as SerializedEditorState} />
        </div>
      ) : null}
      {children}
    </>
  )

  return (
    <>
      <Breadcrumbs items={[{ label: page.title }]} />
      {activeNavKey ? (
        <CatalogShell activeKey={activeNavKey}>
          <div className="max-w-[var(--measure-body)]">{body}</div>
        </CatalogShell>
      ) : (
        <div className="mx-auto max-w-[var(--measure-body)] px-5 py-12 md:px-8">{body}</div>
      )}
    </>
  )
}
