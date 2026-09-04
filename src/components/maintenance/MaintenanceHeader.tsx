import { BrandMark } from '@/components/brand/BrandMark'
import { routing, type Locale } from '@/i18n/routing'

/**
 * Шапка заглушки — визуально шапка витрины (WIREFRAMES.md §Шапка), но урезанная:
 * знак + MON FLACON + дескриптор и переключатель локалей. Поиска и корзины нет
 * намеренно — обе кнопки ведут в закрытый каталог.
 *
 * Переключатель здесь — обычные `<a>`, а не `LocaleSwitcher` витрины: тот
 * клиентский и живёт внутри `NextIntlClientProvider`, которого у заглушки нет.
 * Полная перезагрузка на `/ro` · `/ru` · `/en` снова попадает в мидлварь и
 * возвращает заглушку в нужной локали — из режима переключение не выводит.
 */
export function MaintenanceHeader({ locale }: { locale: Locale }) {
  return (
    <header className="bg-navy border-line-on-dark border-b">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-4 md:px-8 md:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="text-cream h-8 w-auto shrink-0" />
          <span className="overflow-hidden">
            <span className="text-cream text-label tracking-wordmark block leading-none font-light whitespace-nowrap uppercase">
              Mon Flacon
            </span>
            <span className="text-ink-on-dark-subtle text-micro tracking-eyebrow mt-1 hidden leading-none whitespace-nowrap uppercase sm:block">
              Perfumes for everyone
            </span>
          </span>
        </div>

        <nav
          className="text-eyebrow tracking-label flex shrink-0 items-center gap-1.5"
          aria-label="RO · RU · EN"
        >
          {routing.locales.map((item, index) => (
            <span key={item} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-ink-on-dark-faint">·</span>}
              <a
                href={`/${item}`}
                lang={item}
                aria-current={item === locale ? 'true' : undefined}
                className={
                  item === locale
                    ? 'text-cream decoration-cream uppercase underline underline-offset-4'
                    : 'text-ink-on-dark-faint hover:text-cream uppercase transition-colors'
                }
              >
                {item}
              </a>
            </span>
          ))}
        </nav>
      </div>
    </header>
  )
}
