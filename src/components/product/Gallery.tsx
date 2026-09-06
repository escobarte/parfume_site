'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { BottleGlyph } from '@/components/brand/BrandMark'

type GalleryImage = { url: string; full: string; alt: string }

// Свайп короче этого порога (px) считается тапом/скроллом страницы, не сменой фото.
const SWIPE_THRESHOLD = 40

/**
 * Галерея: главное фото + миниатюры, клик по фото открывает зум-оверлей.
 * Переключение между фото (клавиатуры ← →, свайп, стрелки на самом фото)
 * работает в обоих режимах — инлайн-просмотр и зум (багфикс, сентябрь 2026:
 * до этого единственным способом сменить фото был клик по миниатюре).
 */
export function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const t = useTranslations('Product')
  const [active, setActive] = useState(0)
  const [zoom, setZoom] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const didSwipe = useRef(false)

  const count = images.length
  const goTo = (index: number) => setActive(((index % count) + count) % count)
  const goPrev = () => goTo(active - 1)
  const goNext = () => goTo(active + 1)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoom(false)
      if (count < 2) return
      if (event.key === 'ArrowLeft') goPrev()
      if (event.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = zoom ? 'hidden' : ''
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, active, count])

  if (!images.length) {
    return (
      <div className="bg-surface-warm border-line flex aspect-square items-center justify-center border">
        <BottleGlyph className="text-navy h-2/3 w-auto" />
      </div>
    )
  }

  const current = images[Math.min(active, images.length - 1)]

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    didSwipe.current = false
  }

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || count < 2) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      didSwipe.current = true
      if (dx < 0) goNext()
      else goPrev()
    }
  }

  // Тап, продолженный свайпом, не должен ещё и открывать/закрывать зум.
  const onOpenZoomClick = () => {
    if (didSwipe.current) {
      didSwipe.current = false
      return
    }
    setZoom(true)
  }

  const arrowButtonClass =
    'bg-surface border-line text-ink hover:border-navy absolute top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full border p-2 transition-colors'

  const arrows =
    count > 1 ? (
      <>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            goPrev()
          }}
          aria-label={t('galleryPrev')}
          className={`${arrowButtonClass} left-3`}
        >
          <ChevronLeft className="size-4" strokeWidth={1.6} />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            goNext()
          }}
          aria-label={t('galleryNext')}
          className={`${arrowButtonClass} right-3`}
        >
          <ChevronRight className="size-4" strokeWidth={1.6} />
        </button>
      </>
    ) : null

  // Зум-режим: карточка со светлым фоном лежит на тёмном оверлее — стрелки
  // здесь снаружи карточки, на тёмном фоне, поэтому светлая тема кнопок
  // (arrowButtonClass выше) не подходит по контрасту, нужна тёмная версия.
  const zoomArrowButtonClass =
    'bg-navy/60 border-line-on-dark text-cream hover:bg-navy/80 fixed top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full border p-2 transition-colors'

  const zoomArrows =
    count > 1 ? (
      <>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            goPrev()
          }}
          aria-label={t('galleryPrev')}
          className={`${zoomArrowButtonClass} left-3 md:left-6`}
        >
          <ChevronLeft className="size-5" strokeWidth={1.6} />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            goNext()
          }}
          aria-label={t('galleryNext')}
          className={`${zoomArrowButtonClass} right-3 md:right-6`}
        >
          <ChevronRight className="size-5" strokeWidth={1.6} />
        </button>
      </>
    ) : null

  return (
    <div>
      <div className="relative">
        <button
          type="button"
          onClick={onOpenZoomClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
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
        {arrows}
      </div>

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
            aria-label={t('galleryClose')}
            className="bg-navy/60 border-line-on-dark text-cream hover:bg-navy/80 fixed top-5 right-5 z-10 cursor-pointer rounded-full border p-2 transition-colors"
          >
            <X className="size-6" strokeWidth={1.6} />
          </button>

          {/* Карточка фото — ограниченный по размеру блок со своим светлым
              фоном (bg-surface-warm, тот же токен, что и в инлайн-просмотре),
              не растянута на весь экран — вокруг неё виден тёмный оверлей. */}
          <div
            className="bg-surface-warm border-line relative aspect-square w-[min(90vw,80vh,42rem)] rounded-2xl border"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="absolute inset-4 md:inset-6">
              <Image
                src={current.full}
                alt={current.alt}
                fill
                sizes="90vw"
                className="object-contain"
              />
            </div>
          </div>
          {zoomArrows}
        </div>
      )}
    </div>
  )
}
