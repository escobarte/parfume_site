import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getHomepage } from '@/lib/content/globals'
import type { Brand } from '@/payload-types'

/** Бренд-строка главной (WIREFRAMES.md §5): одна центрированная строка без логотипов. */
export async function BrandStrip({ locale }: { locale: Locale }) {
  const homepage = await getHomepage(locale)
  const brands = (homepage.featuredBrands ?? []).filter(
    (brand): brand is Brand => typeof brand === 'object',
  )
  if (brands.length === 0) return null

  return (
    <section className="border-line bg-surface border-b px-5 py-9.5 text-center md:px-8">
      <p className="text-ink-subtle text-label tracking-brandline font-light uppercase">
        {brands.map((brand, index) => (
          <span key={brand.id}>
            {index > 0 && <span aria-hidden="true"> · </span>}
            <Link href={`/brands/${brand.slug}`} className="hover:text-ink transition-colors">
              {brand.title}
            </Link>
          </span>
        ))}
      </p>
    </section>
  )
}
