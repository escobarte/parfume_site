'use client'

import { create } from 'zustand'

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
  apply: (code: string, percent: number) => void
  clear: () => void
}

export const usePromo = create<PromoState>()((set) => ({
  code: null,
  percent: null,
  apply: (code, percent) => set({ code, percent }),
  clear: () => set({ code: null, percent: null }),
}))
