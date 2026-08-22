import type { Payload, PayloadRequest } from 'payload'
import { toTable } from './csv'
import { detectDescriptionLocales, detectKind } from './detect'
import { applyProducts, groupFormatA, groupFormatB, type ProductInput } from './applyProducts'
import { applyPrices, applyTranslations } from './applyUpdates'
import type { FormatARow, FormatBRow, PriceRow, TranslationRow } from './schema'
import { emptyPlan, type ImportResult, type RowError } from './types'
import { findDuplicates, validateRows } from './validate'

export type ImportOptions = {
  /** Локаль, в которую пишется контент прайса (базовая локаль клиента). */
  locale?: string
  dryRun?: boolean
}

/**
 * Импорт CSV: разбор → валидация всего файла → применение в одной транзакции.
 * Ни одна строка не применяется, если хоть где-то ошибка формата
 * (всё-или-ничего, ТЗ §4.7).
 */
export async function runImport(
  payload: Payload,
  csvText: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const locale = options.locale ?? process.env.IMPORT_LOCALE ?? 'ro'
  const dryRun = options.dryRun ?? false

  const table = toTable(csvText)
  const kind = detectKind(table.header)

  if (!kind) {
    return {
      ok: false,
      dryRun,
      plan: emptyPlan('products-a', locale),
      errors: [
        {
          line: 1,
          message:
            'не удалось определить формат файла по заголовку — ожидались колонки handle+sku+price (A), handle+variants (B), sku+price/stock (прайс) или handle+locale (переводы)',
        },
      ],
    }
  }

  const plan = emptyPlan(kind, locale)
  if (kind === 'products-a' || kind === 'products-b') {
    plan.descriptionLocales = detectDescriptionLocales(table.header)
  }

  if (!table.records.length) {
    return { ok: false, dryRun, plan, errors: [{ line: 1, message: 'в файле нет строк данных' }] }
  }

  const { rows, errors } = validateRows<unknown>(kind, table.records)
  const allErrors: RowError[] = [...errors]

  if (kind === 'products-a') {
    allErrors.push(
      ...findDuplicates(rows as { line: number; value: FormatARow }[], (v) => v.sku, 'sku'),
    )
  }
  if (kind === 'products-b') {
    allErrors.push(
      ...findDuplicates(rows as { line: number; value: FormatBRow }[], (v) => v.handle, 'handle'),
    )
  }
  if (kind === 'prices') {
    allErrors.push(
      ...findDuplicates(rows as { line: number; value: PriceRow }[], (v) => v.sku, 'sku'),
    )
  }

  if (allErrors.length) {
    return { ok: false, dryRun, plan, errors: allErrors.sort((a, b) => a.line - b.line) }
  }

  // ── Применение ────────────────────────────────────────────────────────
  const transactionID = dryRun ? null : await payload.db.beginTransaction()
  const req = transactionID ? ({ transactionID } as Partial<PayloadRequest>) : undefined

  try {
    if (kind === 'products-a' || kind === 'products-b') {
      const inputs: ProductInput[] =
        kind === 'products-a'
          ? groupFormatA(rows as { line: number; value: FormatARow }[])
          : groupFormatB(rows as { line: number; value: FormatBRow }[])
      await applyProducts(payload, inputs, { locale, dryRun, req }, plan)
      plan.touched = inputs.length
    } else if (kind === 'prices') {
      await applyPrices(
        payload,
        rows as { line: number; value: PriceRow }[],
        { locale, dryRun, req },
        plan,
      )
    } else {
      await applyTranslations(
        payload,
        rows as { line: number; value: TranslationRow }[],
        { locale, dryRun, req },
        plan,
      )
    }

    if (transactionID) await payload.db.commitTransaction(transactionID)
    return { ok: true, dryRun, plan, errors: [] }
  } catch (error) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID)
    return {
      ok: false,
      dryRun,
      plan,
      errors: [
        {
          line: 0,
          message: `импорт откачен целиком: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    }
  }
}
