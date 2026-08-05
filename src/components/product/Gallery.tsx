'use client'

import { X } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { BottleGlyph } from '@/components/brand/BrandMark'

type GalleryImage = { url: string; full: string; alt: string }

/** Галерея: главное фото + миниатюры, клик по фото открывает зум-оверлей. */
export function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const t = useTranslations('Product')
  const [active, setActive] = useState(0)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setZoom(false)
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = zoom ? 'hidden' : ''
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [zoom])

  if (!images.length) {
    return (
      <div className="bg-surface-warm border-line flex aspect-square items-center justify-center border">
        <BottleGlyph className="text-navy h-2/3 w-auto" />
      </div>
    )
  }

  const current = images[Math.min(active, images.length - 1)]

  return (
    <div>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={t('zoomHint')}
        className="bg-surface-warm border-line relative block aspect-square w-full cursor-zoom-in border"
      >
        <Image
          src={current.url}
          alt={current.alt}
          fill
          priority
          sizes="(max-width: 1023px) 100vw, 45vw"
          className="object-contain p-6"
        />
      </button>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`${title} — ${index + 1}`}
              aria-current={index === active}
              className={`bg-surface-warm relative size-16 cursor-pointer border transition-colors ${
                index === active ? 'border-navy' : 'border-line hover:border-navy'
              }`}
            >
              <Image
                src={image.url}
                alt={image.alt}
                fill
                sizes="64px"
                className="object-contain p-1.5"
              />
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <div className="bg-navy/95 fixed inset-0 z-70 flex items-center justify-center p-6">
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label={t('zoomHint')}
            className="text-cream absolute top-5 right-5 cursor-pointer"
          >
            <X className="size-6" strokeWidth={1.6} />
          </button>
          <div className="relative h-full w-full max-w-4xl">
            <Image
              src={current.full}
              alt={current.alt}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
