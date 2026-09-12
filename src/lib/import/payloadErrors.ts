/**
 * Разбор ошибок валидации Payload для отчёта импорта.
 *
 * `ValidationError.message` — это всегда общий текст вида «Следующее поле
 * недействительно: Варианты > Variants»: он называет ПОЛЕ, но не причину.
 * Сообщение, которое сформулировала сама `validate`-функция (например,
 * `variantsDiscountConsistent`), лежит глубже — в `error.data.errors[]`,
 * вместе с человекочитаемой меткой поля и путём к нему.
 *
 * До 2026-09-12 отчёт импорта печатал только `error.message`, поэтому
 * заливающий прайс видел «Варианты > Variants» и не мог понять ни какой
 * товар виноват, ни что в нём поправить.
 */

export type PayloadFieldError = {
  /** Человекочитаемая метка поля из админки: «Варианты > Variants». */
  label?: string
  /** Текст, который вернула сама validate-функция. Ради него всё и затевалось. */
  message: string
  /** Путь к полю: `variants`. */
  path?: string
}

type MaybeValidationError = {
  name?: unknown
  data?: { errors?: unknown }
}

/**
 * Достаёт сообщения конкретных полей. Пустой массив — значит это не
 * ValidationError (сеть, БД, что угодно ещё), и вызывающий код должен
 * откатиться на обычный `error.message`.
 */
export function fieldErrorsOf(error: unknown): PayloadFieldError[] {
  if (!error || typeof error !== 'object') return []
  const candidate = (error as MaybeValidationError).data?.errors
  if (!Array.isArray(candidate)) return []

  return candidate.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.message !== 'string' || !row.message) return []
    return [
      {
        message: row.message,
        ...(typeof row.label === 'string' ? { label: row.label } : {}),
        ...(typeof row.path === 'string' ? { path: row.path } : {}),
      },
    ]
  })
}

/**
 * Читаемая причина отказа: сообщения полей через «; », либо общий текст
 * ошибки, если разобрать не удалось.
 */
export function describeError(error: unknown): string {
  const fields = fieldErrorsOf(error)
  if (fields.length) return fields.map((field) => field.message).join('; ')
  return error instanceof Error ? error.message : String(error)
}
