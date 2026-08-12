import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ProductCard } from '@/components/catalog/ProductCard'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { BuyBlock } from '@/components/product/BuyBlock'
import { Gallery } from '@/components/product/Gallery'
import { Link } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import { getProductBySlug, getSimilarProducts } from '@/lib/catalog/product'
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

  const [tf, tc] = await Promise.all([
    getTranslations({ locale, namespace: 'Catalog.family' }),
    getTranslations({ locale, namespace: 'Catalog' }),
  ])
  const title = product.brand ? `${product.title} — ${product.brand.title}` : product.title
  const description = [
    product.family ? tf(product.family) : null,
    product.notes.map((note) => note.title).join(', ') || null,
    product.minPrice !== null ? `${tc('from')} ${product.minPrice} MDL` : null,
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

function Pyramid({
  labels,
  pyramid,
}: {
  labels: { title: string; top: string; heart: string; base: string }
  pyramid: { top: string[]; heart: string[]; base: string[] }
}) {
  const rows = [
    { label: labels.top, items: pyramid.top },
    { label: labels.heart, items: pyramid.heart },
    { label: labels.base, items: pyramid.base },
  ].filter((row) => row.items.length > 0)

  if (!rows.length) return null

  return (
    <section className="mt-10">
      <h2 className="text-ink text-section tracking-display font-light uppercase">
        {labels.title}
      </h2>
      <dl className="border-line mt-4 border-t">
        {rows.map((row) => (
          <div key={row.label} className="border-line grid grid-cols-[1fr_2fr] gap-4 border-b py-3">
            <dt className="text-ink-muted text-eyebrow tracking-label uppercase">{row.label}</dt>
            <dd className="text-ink text-body-sm">{row.items.join(', ')}</dd>
          </div>
        ))}
      </dl>
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
          <Gallery images={product.images} title={product.title} />

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

            {product.notes.length > 0 && (
              <p className="text-ink-muted text-body-sm mt-2">
                {[product.family ? tc(`family.${product.family}`) : null]
                  .concat(product.notes.map((note) => note.title.toLowerCase()).join(', '))
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}

            <div className="mt-8">
              <BuyBlock product={product} image={product.images[0]?.url ?? null} />
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
