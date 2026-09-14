import { getImageProps } from 'next/image'
import { Link } from '@/i18n/navigation'
import type { BannerImage, HeroBanner } from '@/lib/content/heroBanners'

/** Брейкпоинты слотов — те же 768/1024, что `md`/`lg` Tailwind. */
const DESKTOP_MEDIA = '(min-width: 1024px)'
const TABLET_MEDIA = '(min-width: 768px)'

/**
 * Один баннер: картинка во всю ширину в собственной пропорции (текст вшит
 * дизайнером, обрезать нельзя — поэтому `h-auto`, а не `object-cover`).
 * Ссылка оборачивает баннер ЦЕЛИКОМ, без кнопки поверх. Ссылка не задана —
 * баннер просто картинка.
 *
 * **Три картинки под ширину экрана — через `<picture>`, а не три `<Image>`.**
 * Это art direction (разные файлы и пропорции, а не один файл разного
 * размера): `sizes` у next/image выбирает размер ОДНОГО исходника и тут не
 * помогает, а три `<Image>`, спрятанные CSS, браузер скачал бы все. У
 * `<picture>` браузер берёт ровно один `<source>` по `media`. Оптимизация
 * next/image сохраняется — `srcSet` каждого источника строит
 * `getImageProps()` (официальный приём Next для art direction).
 *
 * Порядок: ≥1024 — десктоп; 768–1023 — планшет, иначе десктоп; <768 —
 * мобильный, иначе десктоп. Источник, совпадающий с тем, что показалось бы
 * и без него, не выводится — у старого баннера с одной картинкой это
 * просто `<img>`, как раньше.
 *
 * `preload` не ставится намеренно: `<link rel=preload>` знает об одном
 * варианте и скачал бы его на всех ширинах — ровно лишний вес, которого
 * избегаем. Первому слайду — `fetchPriority="high"` и `loading="eager"`.
 *
 * Без `'use client'`: рендерится и сервером (один баннер — без JS карусели),
 * и внутри клиентской карусели.
 */
export function HeroBannerSlide({ banner, priority }: { banner: HeroBanner; priority: boolean }) {
  const propsOf = (image: BannerImage) =>
    getImageProps({
      src: image.url,
      width: image.width,
      height: image.height,
      alt: banner.alt,
      sizes: '100vw',
      loading: priority ? 'eager' : 'lazy',
      fetchPriority: priority ? 'high' : 'auto',
    }).props

  const tiers = [
    { media: DESKTOP_MEDIA, image: banner.image },
    { media: TABLET_MEDIA, image: banner.imageTablet ?? banner.image },
  ]
  const base = banner.imageMobile ?? banner.image
  const sources = tiers.filter(
    (tier, index) => tier.image.url !== (tiers[index + 1]?.image ?? base).url,
  )
  // `alt` явно, а не только внутри spread: иначе jsx-a11y его не видит.
  const { alt, ...imgProps } = propsOf(base)

  const picture = (
    <picture>
      {sources.map(({ media, image }) => {
        const { srcSet, sizes, width, height } = propsOf(image)
        return (
          <source
            key={media}
            media={media}
            srcSet={srcSet}
            sizes={sizes}
            width={width}
            height={height}
          />
        )
      })}
      <img {...imgProps} alt={alt} className="block h-auto w-full" />
    </picture>
  )

  if (!banner.href) return picture
  return (
    <Link href={banner.href} className="block">
      {picture}
    </Link>
  )
}
