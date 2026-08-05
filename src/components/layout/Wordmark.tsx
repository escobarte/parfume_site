import { Link } from '@/i18n/navigation'
import { BrandMark } from '@/components/brand/BrandMark'

/**
 * Логотип шапки: знак + MON FLACON + дескриптор (WIREFRAMES.md §Шапка).
 * При sticky-сжатии остаётся только знак — правило брендбука о малых форматах
 * (BRAND.md §4), поэтому текстовая часть управляется пропом `compact`.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="MON FLACON">
      <BrandMark className="text-cream h-8 w-auto shrink-0 transition-all" />
      {/* На 768–1023 текстовая часть уступает место меню и остаётся только знак —
          брендбук это разрешает для малых форматов (BRAND.md §4). */}
      <span
        className={`overflow-hidden transition-all md:hidden lg:block ${
          compact ? 'w-0 opacity-0' : 'w-auto opacity-100'
        }`}
      >
        <span className="text-cream text-label tracking-wordmark block leading-none font-light whitespace-nowrap uppercase">
          Mon Flacon
        </span>
        <span className="text-ink-on-dark-subtle text-micro tracking-eyebrow mt-1 hidden leading-none whitespace-nowrap uppercase lg:block">
          Perfumes for everyone
        </span>
      </span>
    </Link>
  )
}
