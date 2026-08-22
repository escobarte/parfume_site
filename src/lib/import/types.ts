export type ImportKind = 'products-a' | 'products-b' | 'prices' | 'translations'

export type RowError = {
  /** Номер строки в файле (1 — заголовок), как в Excel. */
  line: number
  field?: string
  message: string
}

export type ImportPlan = {
  kind: ImportKind
  locale: string
  /** Товары, которых ещё нет в базе. */
  create: string[]
  /** Товары, которые будут обновлены. */
  update: string[]
  /** Справочники, которые будут заведены автоматически. */
  autoCreate: { brands: string[]; categories: string[]; notes: string[] }
  variants: { created: number; updated: number }
  /** Для лёгкого прайса и переводов. */
  touched: number
  /** Строки, для которых не нашлось товара (не ошибка формата, но и не изменение). */
  skipped: RowError[]
  /**
   * Форматы A/B: локали, для которых в заголовке файла есть колонка
   * description_<locale>. Пусто — файл пишет одну description в --locale,
   * как раньше. Заполняется по заголовку целиком (engine.ts), не по кайнду.
   */
  descriptionLocales: string[]
}

export type ImportResult = {
  ok: boolean
  dryRun: boolean
  plan: ImportPlan
  errors: RowError[]
}

export const emptyPlan = (kind: ImportKind, locale: string): ImportPlan => ({
  kind,
  locale,
  create: [],
  update: [],
  autoCreate: { brands: [], categories: [], notes: [] },
  variants: { created: 0, updated: 0 },
  touched: 0,
  skipped: [],
  descriptionLocales: [],
})
