import Image from 'next/image'
import type { Media } from '@/payload-types'

/**
 * Картинка, вставленная в тело текстовой страницы (`Pages.body`, слэш-меню →
 * Upload). Настроек размера у владельца нет намеренно — вид подбирается сам
 * под любой кадр: портрет, ландшафт, квадрат.
 *
 * Без обрезки и без пустых полей: `width/height: auto` + ограничения
 * `max-width` (ширина колонки или экрана) и `max-height`. Браузер уменьшает
 * картинку до первого из ограничений, сохраняя пропорции файла, — поэтому
 * не `object-contain` (тот оставил бы рамку вокруг кадра). Узкий кадр,
 * упёршийся в высоту, центрируется в колонке. `width`/`height` файла
 * передаются в разметку — место под картинку резервируется до загрузки.
 *
 * Высоты — токены `--content-image-max-h*` (`tokens.css`): на десктопе
 * иллюстрация не выше ~половины экрана, на телефоне обычный портрет идёт
 * во всю ширину, ограничен только очень вытянутый.
 *
 * Не для `heroBanners` — там осознанная подмена кадра по брейкпоинтам.
 */
export function RichTextImage({ media, alt }: { media: Media; alt: string }) {
  if (!media.url) return null
  return (
    <Image
      src={media.url}
      alt={alt}
      // SVG может прийти без размеров — next/image требует их; реальную
      // пропорцию всё равно даёт `h-auto w-auto` после загрузки.
      width={media.width || 1200}
      height={media.height || 800}
      sizes="(min-width: 768px) 640px, 100vw"
      className="mx-auto my-8 block h-auto max-h-[var(--content-image-max-h-mobile)] w-auto max-w-full md:max-h-[var(--content-image-max-h)]"
    />
  )
}
