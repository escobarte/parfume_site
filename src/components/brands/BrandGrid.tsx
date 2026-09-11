import { brandLetterAnchor, type BrandLetterGroup } from '@/lib/catalog/brands'
import { BrandCard } from './BrandCard'

/**
 * Сетка брендов, разбитая на секции по буквам. Колонки те же, что у
 * товарной сетки каталога (`CatalogView`) — страницы должны читаться как
 * одна система, а не как два разных каталога.
 *
 * `scroll-mt-*` на заголовке секции — обязателен: указатель липкий, и без
 * отступа якорь уводил бы первую строку букв под него.
 */
export function BrandGrid({ groups }: { groups: BrandLetterGroup[] }) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.letter} aria-labelledby={brandLetterAnchor(group.letter)}>
          <h2
            id={brandLetterAnchor(group.letter)}
            className="text-ink text-section tracking-display border-line scroll-mt-20 border-b pb-2 font-medium uppercase"
          >
            {group.letter}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
            {group.brands.map((brand) => (
              <BrandCard key={brand.id} brand={brand} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
