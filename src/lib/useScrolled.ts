'use client'

import { useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

/**
 * Ширина «мёртвой зоны» вокруг порога, px. Должна быть заметно больше, чем
 * изменение высоты шапки при сжатии (~10–16px) — см. объяснение ниже.
 */
const HYSTERESIS = 24

// Текущее решение живёт в модуле, а не в состоянии React: getSnapshot обязан
// быть чистым от кадра к кадру, но обязан и помнить предыдущий ответ, иначе
// гистерезиса не получится. При неизменном scrollY функция возвращает одно
// и то же значение и ничего не меняет — этого useSyncExternalStore и требует.
let compact = false

/**
 * Прокрутили ли страницу глубже порога — для sticky-сжатия шапки.
 *
 * Порог с гистерезисом, а не одно число (фаза 9.1). Причина: sticky-шапка
 * остаётся в потоке документа, и её сжатие уменьшает высоту контента ВЫШЕ
 * текущей позиции. Браузерный scroll anchoring компенсирует это, подвинув
 * scrollY на ту же величину, — и если позиция стояла впритык к порогу,
 * получался самоподдерживающийся цикл: сжали шапку → якорь сдвинул скролл
 * вниз за порог → шапка разжалась → якорь сдвинул обратно, и так каждый
 * кадр. Внешне — страница сама «прыгает» вверх-вниз и греет процессор.
 *
 * Мёртвая зона в ±24px шире изменения высоты шапки, поэтому вызванный
 * якорем сдвиг физически не может перевести состояние обратно.
 */
export function useScrolled(threshold = 40): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      const y = window.scrollY
      if (y > threshold + HYSTERESIS) compact = true
      else if (y < threshold - HYSTERESIS) compact = false
      return compact
    },
    () => false,
  )
}
