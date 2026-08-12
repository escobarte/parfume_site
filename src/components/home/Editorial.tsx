import Image from 'next/image'
import { BrandMark } from '@/components/brand/BrandMark'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getHomepage } from '@/lib/content/globals'

/**
 * Editorial-блок главной (WIREFRAMES.md §4): формула «1 image + 1 phrase +
 * logo» — двухколоночный navy/cream grid без зазора. Пусто изображение —
 * на cream-плите остаётся знак бренда (BrandMark), не пустая заливка.
 */
export async function Editorial({ locale }: { locale: Locale }) {
  const homepage = await getHomepage(locale)
  const editorial = homepage.editorial
  if (!editorial?.phrase && !editorial?.text) return null

  const image = typeof editorial.image === 'object' ? editorial.image : null
  const imageUrl = image?.sizes?.full?.url ?? image?.url ?? null

  return (
    <section className="grid md:grid-cols-[1.4fr_1fr]">
      <div className="bg-navy flex flex-col justify-center px-6 py-16 md:px-11">
        {editorial.phrase && (
          <h2 className="text-cream text-display tracking-display leading-display uppercase">
            {editorial.phrase}
          </h2>
        )}
        <div className="bg-cream/40 mt-6 h-px w-9" />
        {editorial.text && (
          <p className="text-ink-on-dark-muted text-body-sm leading-body mt-6 max-w-82.5 font-light">
            {editorial.text}
          </p>
        )}
        {editorial.linkLabel && editorial.linkHref && (
          <Link
            href={editorial.linkHref}
            className="text-cream text-link tracking-link mt-6 inline-block w-fit"
          >
            {editorial.linkLabel} →
          </Link>
        )}
      </div>
      <div className="bg-cream relative flex min-h-70 items-center justify-center">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={image?.alt ?? ''}
            fill
            sizes="(max-width: 767px) 100vw, 40vw"
            className="object-cover"
          />
        ) : (
          <BrandMark className="text-navy h-35 w-auto" strokeWidth={3} />
        )}
      </div>
    </section>
  )
}
