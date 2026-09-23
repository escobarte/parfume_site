import { isProductCountry, PRODUCT_COUNTRY_VALUES } from '@/lib/catalog/countries'
import { canonicalProductCategory, PRODUCT_CATEGORY_VALUES } from '@/lib/catalog/productCategories'
import type { RowError } from './types'

/**
 * Скалярные поля уровня ТОВАРА, приезжающие отдельной колонкой CSV:
 * `country_of_origin` и `product_category`. Правила у них совпадают целиком,
 * поэтому логика здесь одна на оба — расходиться по возможностям им нельзя:
 *
 * - канон — точное value из короткого списка, регистр и краевые пробелы прощаем;
 * - пустая ячейка ничего не пишет: у существующего товара остаётся его
 *   значение, у нового срабатывает `defaultValue` поля Payload;
 * - значение не из списка — НЕ ошибка формата: предупреждение в отчёт, товар
 *   импортируется, поле не трогается (опечатка не должна ронять прайс на 100+
 *   позиций — тот же принцип, что у `volume`);
 * - в формате A строк на один `handle` несколько, а поле одно на товар:
 *   канон — первая ЗАПОЛНЕННАЯ строка (пустая ячейка не «побеждает» тем, что
 *   стоит выше), расхождение двух непустых уходит предупреждением.
 */
export type ProductScalarSpec = {
  /** Имя колонки CSV — оно же показывается в отчёте как `field`. */
  column: string
  /** Имя поля в Payload, куда пишется канон. */
  target: 'countryOfOrigin' | 'productCategory'
  /** Как назвать значение в предупреждении: «страна «Marte» не из списка». */
  noun: string
  /** То же во множественном: «строки указывают разные страны». */
  nounPlural: string
  /** Допустимые значения — для подсказки в тексте предупреждения. */
  values: readonly string[]
  /** Канон по сырой ячейке, либо undefined, если значения нет в списке. */
  canonical: (raw: string) => string | undefined
}

export const COUNTRY_SPEC: ProductScalarSpec = {
  column: 'country_of_origin',
  target: 'countryOfOrigin',
  noun: 'страна',
  nounPlural: 'страны',
  values: PRODUCT_COUNTRY_VALUES,
  canonical: (raw) => {
    const normalized = raw.trim().toLowerCase()
    return isProductCountry(normalized) ? normalized : undefined
  },
}

export const PRODUCT_CATEGORY_SPEC: ProductScalarSpec = {
  column: 'product_category',
  target: 'productCategory',
  noun: 'категория товара',
  nounPlural: 'категории товара',
  values: PRODUCT_CATEGORY_VALUES,
  canonical: canonicalProductCategory,
}

/** Оба поля разом — порядок фиксирован, он же порядок разделов в отчёте. */
export const PRODUCT_SCALAR_SPECS = [COUNTRY_SPEC, PRODUCT_CATEGORY_SPEC] as const

/**
 * Формат A: значение в очередной строке того же `handle` разошлось с уже
 * принятым. Возвращает предупреждение либо undefined, если расхождения нет.
 *
 * Пустая ячейка НИ В КАКУЮ сторону не считается расхождением — ни пустая
 * текущая (нечего применять), ни пустая принятая: во втором случае значение
 * подхватывается этой строкой (см. `adoptFilledCells` в applyProducts.ts),
 * а не проигрывает пустоте. До 2026-09-22 было наоборот — товар, у которого
 * `product_category` заполнен не в первой строке handle (обычное дело, когда
 * колонку дописывают руками к готовому прайсу), молча оставался с прежним
 * разделом и не попадал в «Body Care».
 *
 * Если расходящееся значение к тому же не из списка — говорим об этом прямо:
 * иначе отчёт выглядит так, будто «Marte» — законная альтернатива, просто
 * проигравшая первой строке.
 */
export function scalarConflict(
  spec: ProductScalarSpec,
  handle: string,
  line: number,
  firstRaw: string | undefined,
  currentRaw: string | undefined,
): RowError | undefined {
  const first = firstRaw?.trim() ?? ''
  const current = currentRaw?.trim() ?? ''
  if (!current || !first || current === first) return undefined

  const message = spec.canonical(current)
    ? `${handle}: строки указывают разные ${spec.nounPlural} («${first}» и «${current}») — взято первое заполненное`
    : `${handle}: ${spec.noun} «${current}» не из списка (${spec.values.join(' / ')}) и отличается от принятого («${first}») — взято первое заполненное`

  return { line, field: spec.column, message }
}

export type ScalarResolution =
  /** Канон найден — пишем в поле товара. */
  | { kind: 'apply'; value: string }
  /** Значение есть, но не из списка — предупреждение, поле не трогаем. */
  | { kind: 'unknown'; error: RowError }
  /** Пустая ячейка — молча не трогаем поле. */
  | { kind: 'skip' }

/** Разбор ячейки перед записью товара. Общий для форматов A и B. */
export function resolveScalar(
  spec: ProductScalarSpec,
  handle: string,
  line: number,
  raw: string | undefined,
): ScalarResolution {
  const trimmed = raw?.trim()
  if (!trimmed) return { kind: 'skip' }

  const canonical = spec.canonical(trimmed)
  if (canonical) return { kind: 'apply', value: canonical }

  return {
    kind: 'unknown',
    error: {
      line,
      field: spec.column,
      message: `${handle}: ${spec.noun} «${trimmed}» не из списка (${spec.values.join(' / ')}) — поле не изменено`,
    },
  }
}
