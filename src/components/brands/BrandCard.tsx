import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import type { BrandView } from '@/lib/catalog/brands'

/** Высота рамки с логотипом. */
const LOGO_BOX = 'h-[130px]'
/**
 * Рамка бренда без логотипа выше ровно на подпись, которой у него нет:
 * 130 + 35, где 35 = `mt-3` (12px) + строка `text-body` (23px). Значение
 * подобрано замером, а не на глаз — при расхождении рамки в смешанном ряду
 * «с лого + без лого» заканчиваются на разной высоте, и это видно.
 * Менять `LOGO_BOX` или типографику подписи — пересчитать и это.
 */
const NO_LOGO_BOX = 'h-[165px]'

/**
 * Карточка бренда в сетке /brands.
 *
 * Раскладка по референсу владельца (2026-09-11): **название живёт ПОД рамкой,
 * а не внутри неё.** Рамка — это только логотип.
 *
 * Логотип вписывается целиком: `object-contain`, **никогда не обрезая**.
 * Через `object-cover` тут пройти не вышло: файлы логотипов квадратные
 * (320×320), рамка — вытянутая (~221×130 на 1280px), и `cover` срезал у
 * круглых эмблем треть по высоте. `contain` платит за это фоном
 * `surface-warm` по бокам — тем более заметным, чем дальше пропорция
 * логотипа от пропорции рамки.
 *
 * Отступ только вертикальный (`py-4`, тот же шаг, что у подписи под рамкой).
 * Горизонтальный не нужен и вреден: по ширине `contain` и так оставляет
 * поля у любого логотипа выше рамки, а по высоте квадратный логотип упирался
 * в края вплотную — `py-4` даёт ему воздух, не сужая широкие логотипы.
 *
 * Бренд без логотипа — исключение: подписи под рамкой у него нет, вместо
 * логотипа в самой рамке стоит название крупной светлой строкой. Плейсхолдер-
 * иконки нет намеренно (в отличие от `ProductCard`, где её место занимает
 * `BottleGlyph`): у такого бренда название и есть его знак, и дублировать его
 * ещё и подписью снизу незачем.
 *
 * Страна на карточке не показывается (тот же референс). Поле `country`
 * осталось в коллекции и выводится на странице самого бренда.
 */
export function BrandCard({ brand }: { brand: BrandView }) {
  return (
    <article>
      <Link href={`/brands/${brand.slug}`} className="group block">
        {brand.logo ? (
          <>
            <div
              className={`border-line group-hover:border-navy bg-surface-warm relative ${LOGO_BOX} overflow-hidden rounded-sm border transition-colors`}
            >
              <Image
                src={brand.logo.url}
                alt={brand.logo.alt}
                fill
                sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw"
                className="object-contain py-4"
              />
            </div>
            <h3 className="text-ink text-body tracking-label mt-3 font-medium uppercase">
              {brand.title}
            </h3>
          </>
        ) : (
          <div
            className={`border-line group-hover:border-navy flex ${NO_LOGO_BOX} items-center justify-center rounded-sm border px-4 py-6 text-center transition-colors`}
          >
            <h3 className="text-ink text-display tracking-display leading-tight font-light uppercase">
              {brand.title}
            </h3>
          </div>
        )}
      </Link>
    </article>
  )
}
