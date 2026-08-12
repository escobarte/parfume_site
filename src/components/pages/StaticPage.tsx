import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'
import { getPageBySlug } from '@/lib/content/pages'

/**
 * Статическая страница из коллекции `pages` (фаза 5.2) — общий рендер для
 * всех системных страниц (О нас/Доставка/Возврат/Контакты): заголовок +
 * richText-тело. Контент полностью из админки, композиция — общий паттерн
 * сайта (хлебные крошки + светлый контейнер), отдельного макета не утверждено.
 */
export async function StaticPage({ locale, slug }: { locale: Locale; slug: string }) {
  const page = await getPageBySlug(locale, slug)
  if (!page) notFound()

  return (
    <>
      <Breadcrumbs items={[{ label: page.title }]} />
      <div className="mx-auto max-w-[var(--measure-body)] px-5 py-12 md:px-8">
        <h1 className="text-ink text-section tracking-display font-light uppercase">
          {page.title}
        </h1>
        {page.body ? (
          <div className="text-ink text-body-sm leading-body mt-6">
            <RichText data={page.body as SerializedEditorState} />
          </div>
        ) : null}
      </div>
    </>
  )
}
