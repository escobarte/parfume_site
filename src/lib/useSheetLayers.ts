'use client'

import { useEffect, useState } from 'react'

const MARKER = '__mfSheet'

/**
 * Слои модальных шторок, привязанные к истории браузера.
 *
 * Задача: на телефоне «Назад» должна закрывать шторку, а не уводить со
 * страницы каталога. Каждый открытый слой — одна запись в history; «Назад»
 * (popstate) снимает верхний слой. Закрытие крестиком, тапом по фону или
 * кнопкой «Применить» идёт тем же путём — через history.back()/go(), поэтому
 * записи не копятся и история остаётся такой же, какой была до открытия.
 *
 * Вниз состояние меняет только обработчик popstate — единственная точка
 * закрытия, так что UI и история не могут разъехаться.
 */
export function useSheetLayers() {
  const [layers, setLayers] = useState<string[]>([])

  useEffect(() => {
    const onPopState = () =>
      setLayers((current) => (current.length ? current.slice(0, -1) : current))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /** Открыть слой: сначала запись в историю, затем состояние. */
  const open = (name: string) => {
    window.history.pushState({ [MARKER]: layers.length + 1 }, '')
    setLayers([...layers, name])
  }

  /** Закрыть верхний слой: шаг назад по истории, дальше сработает popstate. */
  const closeTop = () => {
    if (layers.length > 0) window.history.back()
  }

  /** Закрыть все слои разом (крестик, фон, «Применить»). */
  const closeAll = () => {
    if (layers.length > 0) window.history.go(-layers.length)
  }

  return {
    layers,
    top: layers[layers.length - 1] ?? null,
    has: (name: string) => layers.includes(name),
    open,
    closeTop,
    closeAll,
  }
}
