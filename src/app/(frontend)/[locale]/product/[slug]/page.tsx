import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BottleGlyph } from '@/components/brand/BrandMark'
import { ProductCard } from '@/components/catalog/ProductCard'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { BuyBlock } from '@/components/product/BuyBlock'
import { ProductGallery } from '@/components/product/ProductGallery'
import { Link } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import { getProductBySlug, getSimilarProducts, type PyramidNote } from '@/lib/catalog/product'
import { staticParamsOrEmpty } from '@/lib/catalog/staticParams'
import { getPayloadClient } from '@/lib/payload'
import { JsonLd } from '@/components/seo/JsonLd'
import { ViewItemEvent } from '@/components/product/ViewItemEvent'
import { productJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await props.params
  const product = await getProductBySlug(slug, locale)
  if (!product) return {}

  const title = product.brand ? `${product.title} — ${product.brand.title}` : product.title
  const description = [
    product.family,
    product.notes.map((note) => note.title).join(', ') || null,
    // Без «от»/диапазона (промпт «новая логика цены товара») — максимальная
    // цена среди вариантов, тот же принцип, что теперь и на карточке.
    product.maxPrice !== null ? `${product.maxPrice} MDL` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return buildMetadata({
    locale,
    path: `/product/${slug}`,
    title,
    seo: product.seo,
    description: description || undefined,
    image: product.images[0]?.full,
  })
}

/** Слаг общий для всех локалей, поэтому статические пути = товары × локали. */
export async function generateStaticParams() {
  return staticParamsOrEmpty(async () => {
    const payload = await getPayloadClient()
    const { docs } = await payload.find({
      collection: 'products',
      depth: 0,
      limit: 1000,
      pagination: false,
      where: { _status: { equals: 'published' } },
    })

    return routing.locales.flatMap((locale) => docs.map((doc) => ({ locale, slug: doc.slug })))
  })
}

/**
 * Пирамида нот под фото (ПРОМПТ 12 v2) — три колонки Top/Heart/Base,
 * иконка + название. Заготовка без `image` (нота ещё не получила иконку от
 * дизайнера, `needsReview: true`) получает плейсхолдер-глиф вместо дырки в
 * вёрстке или сломанной картинки — тот же `BottleGlyph`, что и у карточки
 * товара без фото (ProductCard.tsx).
 */
function Pyramid({
  labels,
  pyramid,
}: {
  labels: { title: string; top: string; heart: string; base: string }
  pyramid: { top: PyramidNote[]; heart: PyramidNote[]; base: PyramidNote[] }
}) {
  const columns = [
    { label: labels.top, items: pyramid.top },
    { label: labels.heart, items: pyramid.heart },
    { label: labels.base, items: pyramid.base },
  ].filter((column) => column.items.length > 0)

  if (!columns.length) return null

  return (
    <section className="mt-8">
      <h2 className="text-ink text-section tracking-display font-light uppercase">
        {labels.title}
      </h2>
      {/* До 400px три колонки по ~80px: иконка 36px + подпись в строку не влезают,
          «Sandalwood» распирал страницу на 6–20px. Там иконка встаёт над подписью,
          отступ колонок меньше; `break-words` — страховка для ещё более длинных нот.
          От 400px раскладка прежняя. */}
      <div className="border-line mt-4 grid grid-cols-3 gap-6 border-t pt-6 max-[399px]:gap-3">
        {columns.map((column) => (
          <div key={column.label}>
            <h3 className="text-ink-muted text-eyebrow tracking-label mb-3 uppercase">
              {column.label}
            </h3>
            <ul className="flex flex-col gap-3">
              {column.items.map((note) => (
                <li
                  key={note.slug}
                  className="flex items-center gap-2.5 max-[399px]:flex-col max-[399px]:items-start max-[399px]:gap-1.5"
                >
                  <span className="bg-surface-warm flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
                    {note.image ? (
                      <Image
                        src={note.image}
                        alt={note.title}
                        width={36}
                        height={36}
                        className="size-full object-cover"
                      />
                    ) : (
                      <BottleGlyph className="text-navy h-5 w-auto" />
                    )}
                  </span>
                  <span className="text-ink text-body-sm max-w-full min-w-0 break-words">
                    {note.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function ProductPage(props: {
  params: Promise<{ locale: Locale; slug: string }>
}) {
  const { locale, slug } = await props.params
  setRequestLocale(locale)

  const product = await getProductBySlug(slug, locale)
  if (!product) notFound()

  const [t, tc, similar] = await Promise.all([
    getTranslations('Product'),
    getTranslations('Catalog'),
    getSimilarProducts(product, locale),
  ])

  return (
    <>
      <JsonLd data={productJsonLd(product, locale)} />
      <ViewItemEvent
        productId={product.id}
        title={product.title}
        brandTitle={product.brand?.title ?? ''}
        price={product.minPrice ?? product.variants[0]?.price ?? 0}
      />
      <Breadcrumbs
        items={[
          { label: tc('title'), href: '/catalog' },
          ...(product.brand
            ? [{ label: product.brand.title, href: `/catalog?brand=${product.brand.slug}` }]
            : []),
          { label: product.title },
        ]}
      />

      <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            {/* Галерея и BuyBlock лежат в разных колонках сетки и общаются
                через URL-состояние объёма (nuqs), а не через общий провайдер —
                поэтому страница целиком остаётся серверной. */}
            <ProductGallery product={product} />

            {/* Пирамида нот — под фото, не в правой колонке (ПРОМПТ 12 v2,
                переезд из старого места ниже описания). */}
            <Pyramid
              labels={{
                title: t('pyramid'),
                top: t('pyramidTop'),
                heart: t('pyramidHeart'),
                base: t('pyramidBase'),
              }}
              pyramid={product.pyramid}
            />
          </div>

          <div>
            {product.brand && (
              <Link
                href={`/catalog?brand=${product.brand.slug}`}
                className="text-ink-muted hover:text-ink text-micro tracking-label uppercase transition-colors"
              >
                {product.brand.title}
              </Link>
            )}
            <h1 className="text-ink text-display mt-2 font-medium">{product.title}</h1>

            {/* Короткая строка под названием — только семейство (ПРОМПТ 12 v2),
                ноты больше не конкатенируются сюда, они теперь в пирамиде
                под фото. */}
            {product.family && <p className="text-ink-muted text-body-sm mt-2">{product.family}</p>}

            <div className="mt-8">
              <BuyBlock product={product} />
            </div>

            {product.description ? (
              <section className="mt-10">
                <h2 className="text-ink text-section tracking-display font-light uppercase">
                  {t('description')}
                </h2>
                <div className="text-ink text-body-sm leading-body max-w-[var(--measure-body)] mt-4">
                  <RichText data={product.description as SerializedEditorState} />
                </div>
              </section>
            ) : null}
          </div>
        </div>

        {similar.length > 0 && (
          <section className="mt-16">
            <h2 className="border-line text-ink text-section tracking-display border-b pb-4 font-light uppercase">
              {t('similar')}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
              {similar.map((item) => (
                <ProductCard key={item.id} product={item} locale={locale} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
