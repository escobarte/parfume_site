import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getHomepage } from '@/lib/content/globals'
import { isWithinWindow } from '@/lib/promo'

const FALLBACK = {
  eyebrow: 'Perfumes for everyone',
  title: 'Find your signature.',
  subtitle: '',
  ctaLabel: 'Catalog',
  ctaHref: '/catalog',
}

/**
 * Hero главной — server component (WIREFRAMES.md §1).
 *
 * «Hero-подмена по датам, без слайдера» (PLAN.md §4.5): пока promoHero
 * включён и текущая дата попадает в интервал startDate–endDate, здесь
 * рендерится акционная версия целиком вместо обычной — решение принимается
 * на сервере по системным часам при каждом запросе, без клиентского JS
 * и без ротации/автосмены. Композиция и типографика одинаковы для обеих
 * версий (только контент и, при наличии, фон), поэтому первый экран
 * остаётся полностью SSR и не влияет на LCP.
 */
export async function Hero({ locale }: { locale: Locale }) {
  const homepage = await getHomepage(locale)
  const promo = homepage.promoHero
  const active = Boolean(promo?.enabled) && isWithinWindow(promo ?? {})

  const eyebrow = (active ? promo?.eyebrow : null) || homepage.hero?.eyebrow || FALLBACK.eyebrow
  const title = (active ? promo?.title : null) || homepage.hero?.title || FALLBACK.title
  const subtitle = (active ? promo?.subtitle : null) || homepage.hero?.subtitle || FALLBACK.subtitle
  const ctaLabel = (active ? promo?.ctaLabel : null) || homepage.hero?.ctaLabel || FALLBACK.ctaLabel
  const ctaHref = (active ? promo?.ctaHref : null) || homepage.hero?.ctaHref || FALLBACK.ctaHref

  const image = active && typeof promo?.image === 'object' ? promo.image : null
  const imageUrl = image?.sizes?.full?.url ?? image?.url ?? null

  return (
    <section className="bg-navy relative overflow-hidden px-5 py-20 text-center md:px-8 md:py-28">
      {imageUrl && (
        <>
          <Image
            src={imageUrl}
            alt={image?.alt ?? ''}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Оверлей держит navy-раму и контраст cream-текста (BRAND.md §2:
              AAA только на чистом navy) поверх произвольного клиентского фото. */}
          <div className="bg-navy/70 absolute inset-0" />
        </>
      )}

      <div className="relative">
        <p className="text-ink-on-dark-subtle text-eyebrow tracking-eyebrow uppercase">{eyebrow}</p>
        <h1 className="text-cream text-hero-mobile tracking-display leading-tight sm:text-hero mt-6 font-light uppercase">
          {title}
        </h1>
        <div className="bg-cream/45 mx-auto mt-7 h-px w-11" />
        {subtitle && (
          <p className="text-ink-on-dark-muted text-body leading-body mx-auto mt-7 max-w-100 font-light">
            {subtitle}
          </p>
        )}
        <Link
          href={ctaHref}
          className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display mt-9 inline-block border px-8 py-3.5 uppercase transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  )
}
