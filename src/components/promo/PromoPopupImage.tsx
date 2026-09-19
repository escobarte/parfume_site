import { getImageProps } from 'next/image'
import type { ResolvedImage } from '@/lib/content/localized'

/** Десктопная колонка начинается там же, где `md:` у Tailwind. */
const DESKTOP_MEDIA = '(min-width: 768px)'

/**
 * Картинка попапа «первая скидка»: слева на всю высоту карточки (≥768px) или
 * полосой сверху (<768px). Весь текст, логотип и процент вшиты в изображение
 * дизайнером — кодом поверх ничего не рисуется.
 *
 * **Два файла под ширину экрана — через `<picture>`, а не `sizes` у
 * next/image.** Это art direction: вертикальный кадр на десктопе и
 * горизонтальный на телефоне — РАЗНЫЕ файлы, а `sizes` подбирает размер
 * одного. Тот же приём, что у баннеров главной (`HeroBannerSlide.tsx`):
 * `getImageProps()` строит `srcSet` каждому источнику, оптимизация
 * `/_next/image` сохраняется, браузер качает ровно один файл.
 *
 * Слоты подменяют друг друга: загружен только один — он показывается на обеих
 * ширинах. Когда оба ведут на один файл, `<source>` не выводится вовсе —
 * остаётся обычный `<img>`.
 *
 * `alt` у `<picture>` один на оба источника (это атрибут `<img>`): берётся
 * описание десктопной картинки, иначе мобильной.
 *
 * Размер задаёт контейнер (`absolute inset-0` + `object-cover`), а не файл —
 * поэтому сдвига вёрстки при загрузке нет ни на одной ширине.
 */
export function PromoPopupImage({
  image,
  imageMobile,
}: {
  image: ResolvedImage | null
  imageMobile: ResolvedImage | null
}) {
  const desktop = image ?? imageMobile
  const mobile = imageMobile ?? image
  if (!desktop || !mobile) return null

  const propsOf = (picked: ResolvedImage) =>
    getImageProps({
      src: picked.url,
      width: picked.width,
      height: picked.height,
      alt: desktop.alt || mobile.alt,
      // Попап монтируется только когда реально открывается — картинка нужна
      // сразу, лениво грузить нечего.
      loading: 'eager',
      sizes: `${DESKTOP_MEDIA} 50vw, 100vw`,
    }).props

  const { alt, ...imgProps } = propsOf(mobile)
  const desktopProps = desktop.url === mobile.url ? null : propsOf(desktop)

  return (
    <picture>
      {desktopProps && (
        <source
          media={DESKTOP_MEDIA}
          srcSet={desktopProps.srcSet}
          sizes={desktopProps.sizes}
          width={desktopProps.width}
          height={desktopProps.height}
        />
      )}
      {/* `alt` явно, а не только внутри spread: иначе jsx-a11y его не видит. */}
      <img {...imgProps} alt={alt} className="absolute inset-0 size-full object-cover" />
    </picture>
  )
}
