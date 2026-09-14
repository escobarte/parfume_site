'use client'

import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react'
import type { HeroBanner } from '@/lib/content/heroBanners'
import { HeroBannerSlide } from './HeroBannerSlide'

/** Пауза между слайдами. */
const AUTOPLAY_MS = 6000

// Свайп короче порога (px) — тап или прокрутка страницы, не смена слайда
// (тот же порог, что в галерее товара).
const SWIPE_THRESHOLD = 40

/**
 * Карусель баннеров главной: смена прозрачностью (без «уезжающей ленты» —
 * спокойнее и ближе языку бренда), автопрокрутка, линии-индикаторы под
 * баннером, свайп на телефоне.
 *
 * Все слайды лежат в одной ячейке грида: высоту секции задаёт картинка, а не
 * захардкоженная пропорция — дизайнер может сменить формат баннеров без
 * правки вёрстки.
 *
 * Автопрокрутка стоит, пока курсор над каруселью или фокус внутри неё, и
 * не включается вовсе при `prefers-reduced-motion`. Таймер перезапускается
 * на каждой смене слайда — после клика по индикатору следующий слайд
 * придёт через полный интервал, а не сразу.
 */
export function HeroCarouselClient({
  banners,
  label,
  slideLabels,
}: {
  banners: HeroBanner[]
  label: string
  slideLabels: string[]
}) {
  const count = banners.length
  const [active, setActive] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  const goTo = (index: number) => setActive(((index % count) + count) % count)

  useEffect(() => {
    if (count < 2 || hovered || focused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setTimeout(() => setActive((current) => (current + 1) % count), AUTOPLAY_MS)
    return () => clearTimeout(id)
  }, [active, count, hovered, focused])

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    swiped.current = false
  }

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true
      goTo(dx < 0 ? active + 1 : active - 1)
    }
  }

  // Свайп по баннеру-ссылке не должен ещё и открывать ссылку.
  const onClickCapture = (event: MouseEvent) => {
    if (!swiped.current) return
    swiped.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="bg-navy"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Пауза — только для фокуса С КЛАВИАТУРЫ. Клик мышью по индикатору
      // тоже оставляет на кнопке фокус, и с простым onFocus автопрокрутка
      // после первого же клика не возобновлялась бы, пока человек не
      // кликнет где-то ещё (поймано e2e).
      onFocus={(event) => setFocused(event.target.matches(':focus-visible'))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <div
        className="grid"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
      >
        {banners.map((banner, index) => {
          const isActive = index === active
          return (
            <div
              key={banner.id}
              role="group"
              aria-roledescription="slide"
              aria-label={slideLabels[index]}
              aria-hidden={!isActive}
              inert={!isActive}
              data-active={isActive}
              className={`col-start-1 row-start-1 transition-opacity duration-700 motion-reduce:transition-none ${
                isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <HeroBannerSlide banner={banner} priority={index === 0} />
            </div>
          )
        })}
      </div>

      <div className="flex justify-center gap-1 py-2">
        {banners.map((banner, index) => {
          const isActive = index === active
          return (
            <button
              key={banner.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={slideLabels[index]}
              aria-current={isActive}
              className="group cursor-pointer px-1.5 py-3"
            >
              <span
                className={`block h-0.5 w-8 transition-colors ${
                  isActive ? 'bg-cream' : 'bg-line-on-dark group-hover:bg-ink-on-dark-muted'
                }`}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
