'use client'

import { Logout } from '@payloadcms/ui'

/**
 * Явная, всегда видимая ссылка «Выйти» в шапке /admin (баг из приёмки
 * фазы 4.7.5): штатная кнопка Payload лежит внутри `nav__log-out` —
 * элемента бокового меню-шторки (`Nav`), которая по умолчанию свёрнута —
 * живому пользователю на экране (без клика по гамбургеру) она не видна,
 * хотя в DOM присутствует. Сама `Nav` не трогается (не переверстываем
 * структуру Payload admin) — вместо этого та же штатная `Logout` из
 * `@payloadcms/ui` (её собственный href/иконка/i18n-подпись) продублирована
 * в `admin.components.actions` — always-visible зону шапки рядом с
 * переключателем локали, где её видно на любом экране без доп. кликов.
 */
export function LogoutAction() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4em' }}>
      <Logout />
    </span>
  )
}
