import type { ZodType } from 'zod'
import type { CsvRecord } from './csv'
import type { ImportKind, RowError } from './types'
import { formatARow, formatBRow, priceRow, translationRow } from './schema'

const SCHEMAS: Record<ImportKind, ZodType> = {
  'products-a': formatARow,
  'products-b': formatBRow,
  prices: priceRow,
  translations: translationRow,
}

export type ValidatedRow<T> = { line: number; value: T }

/**
 * Валидация всего файла до единой записи в БД: клиент должен увидеть сразу все
 * проблемы с номерами строк, а не первую попавшуюся (ТЗ §4.7).
 */
export function validateRows<T>(
  kind: ImportKind,
  records: CsvRecord[],
): { rows: ValidatedRow<T>[]; errors: RowError[] } {
  const schema = SCHEMAS[kind]
  const rows: ValidatedRow<T>[] = []
  const errors: RowError[] = []

  for (const record of records) {
    const parsed = schema.safeParse(record.data)
    if (parsed.success) {
      rows.push({ line: record.line, value: parsed.data as T })
      continue
    }
    for (const issue of parsed.error.issues) {
      errors.push({
        line: record.line,
        field: issue.path.join('.') || undefined,
        message: issue.message,
      })
    }
  }

  return { rows, errors }
}

/** Дубликаты внутри файла — частая причина «тихих» перезаписей. */
export function findDuplicates<T>(
  rows: ValidatedRow<T>[],
  key: (value: T) => string | undefined,
  label: string,
): RowError[] {
  const seen = new Map<string, number>()
  const errors: RowError[] = []

  for (const row of rows) {
    const value = key(row.value)
    if (!value) continue
    const firstLine = seen.get(value)
    if (firstLine) {
      errors.push({
        line: row.line,
        field: label,
        message: `${label} «${value}» уже встречался в строке ${firstLine}`,
      })
    } else {
      seen.set(value, row.line)
    }
  }

  return errors
}
