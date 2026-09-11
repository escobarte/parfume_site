import {
  BRAND_ALPHABET,
  BRAND_OTHER_LETTER,
  brandLetterAnchor,
  type BrandLetterGroup,
} from '@/lib/catalog/brands'

/**
 * Указатель A–Z над сеткой брендов. Серверный компонент и обычные
 * якорные ссылки — без `'use client'`: переход к секции буквы целиком
 * решается `href="#..."` и `scroll-mt-*` на самой секции, JS тут не нужен.
 *
 * Буквы показываются ВСЕ, даже пустые — иначе указатель дёргается по ширине
 * от каталога к каталогу и перестаёт читаться как алфавит. Пустая буква не
 * ссылка, а приглушённый текст: кликать некуда, и это видно сразу.
 *
 * «#» (цифры и прочее) добавляется в конец, только если такая группа реально
 * есть — постоянный пустой «#» в хвосте выглядел бы опечаткой.
 */
export function BrandAlphabet({ groups, label }: { groups: BrandLetterGroup[]; label: string }) {
  const filled = new Set(groups.map((group) => group.letter))
  const letters = [...BRAND_ALPHABET, ...(filled.has(BRAND_OTHER_LETTER) ? [BRAND_OTHER_LETTER] : [])]

  return (
    <nav
      aria-label={label}
      className="border-line bg-surface sticky top-0 z-10 flex flex-wrap gap-x-1 gap-y-1.5 border-b py-3"
    >
      {letters.map((letter) =>
        filled.has(letter) ? (
          <a
            key={letter}
            href={`#${brandLetterAnchor(letter)}`}
            className="text-ink hover:border-navy border-line text-label tracking-label rounded-sm border px-2 py-1 font-medium transition-colors"
          >
            {letter}
          </a>
        ) : (
          <span
            key={letter}
            aria-disabled="true"
            className="text-ink-subtle text-label tracking-label border border-transparent px-2 py-1"
          >
            {letter}
          </span>
        ),
      )}
    </nav>
  )
}
