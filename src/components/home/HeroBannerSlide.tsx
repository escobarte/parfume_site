import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import type { HeroBanner } from '@/lib/content/heroBanners'

/**
 * Один баннер: картинка во всю ширину в собственной пропорции (текст вшит
 * дизайнером, обрезать нельзя — поэтому `h-auto`, а не `object-cover`).
 * Ссылка оборачивает баннер ЦЕЛИКОМ, без кнопки поверх. Ссылка не задана —
 * баннер просто картинка.
 *
 * Без `'use client'`: рендерится и сервером (один баннер — без JS карусели),
 * и внутри клиентской карусели.
 */
export function HeroBannerSlide({ banner, priority }: { banner: HeroBanner; priority: boolean }) {
  const image = (
    <Image
      src={banner.image.url}
      alt={banner.alt}
      width={banner.image.width}
      height={banner.image.height}
      sizes="100vw"
      priority={priority}
      className="block h-auto w-full"
    />
  )

  if (!banner.href) return image
  return (
    <Link href={banner.href} className="block">
      {image}
    </Link>
  )
}
