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
  variants: {
    created: number
    updated: number
    /**
     * Форматы A/B: строки с нераспознанным значением `volume` (не из
     * фиксированного списка 3ml/5ml/10ml/travel/full, ПРОМПТ 12-дополнение) —
     * предупреждение, не ошибка формата. Такая строка (вариант) пропускается,
     * остальной файл применяется как обычно, товар не создаётся, только если
     * ВСЕ его строки оказались с плохим объёмом (см. applyProducts.ts).
     */
    invalidVolume: RowError[]
  }
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
  /** Форматы A/B: колонка images — сколько файлов реально привязано и какие имена не нашлись в медиатеке. */
  images: { attached: number; missing: RowError[] }
  /**
   * Форматы A/B с ОДНОЙ колонкой description: сколько локалей получит дубль
   * этого текста (считаются только те, где описание было пустым). 0 — либо
   * файл трёхколоночный, либо везде уже есть перевод: предупреждать не о чем.
   */
  descriptionDuplicated: number
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
  variants: { created: 0, updated: 0, invalidVolume: [] },
  touched: 0,
  skipped: [],
  descriptionLocales: [],
  images: { attached: 0, missing: [] },
  descriptionDuplicated: 0,
})
