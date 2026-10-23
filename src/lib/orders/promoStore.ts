'use client'

import { create } from 'zustand'
import { NO_PROMO_RULE, type PromoRule } from '@/lib/orders/promoRule'

/**
 * Применённый промокод (фаза 11.2, задача 7) — отдельный маленький стор,
 * не часть `useCart`: код относится к заявке, а не к позициям корзины, и
 * должен сбрасываться независимо (например, если сервер отклонит его при
 * оформлении — гонка между проверкой и отправкой). Не персистится
 * (`localStorage`) намеренно — это превью, а не источник истины, сервер
 * всё равно переоценивает код заново при реальном оформлении.
 */
type PromoState = {
  code: string | null
  percent: number | null
  /**
   * Условие применения кода (2026-10-23) — `/api/promo-code-check` отдаёт
   * его вместе с процентом. `NO_PROMO_RULE` у старых кодов без условий, не
   * `null`, — чтобы вызывающему не нужно было помнить два разных «пусто».
   */
  rule: PromoRule
  /**
   * Телефон, которым код подтвердили на шаге сверки в корзине (2026-09-11).
   * Уезжает в заявку ОТДЕЛЬНО от телефона доставки: код выдан на конкретный
   * номер, а заказ человек может оформлять на другой (например, телефон
   * получателя). Для публичного кода остаётся `null` — ему сверка не нужна.
   *
   * Секретом это значение не является и защиту не ослабляет: сервер при
   * оформлении всё равно сверяет его с тем, что лежит в БД у кода. Клиент,
   * не знающий нужного номера, подставить его не сможет — в этом и смысл
   * шага сверки.
   */
  phone: string | null
  apply: (code: string, percent: number, rule: PromoRule, phone?: string | null) => void
  clear: () => void
}

export const usePromo = create<PromoState>()((set) => ({
  code: null,
  percent: null,
  rule: NO_PROMO_RULE,
  phone: null,
  apply: (code, percent, rule, phone = null) => set({ code, percent, rule, phone }),
  clear: () => set({ code: null, percent: null, rule: NO_PROMO_RULE, phone: null }),
}))
