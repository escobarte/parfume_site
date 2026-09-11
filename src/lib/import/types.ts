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
  /**
   * `invalidVolume` — форматы A/B: строки/варианты с volume не из списка 5
   * значений (новая модель объёма) — предупреждение, не ошибка формата,
   * строка/вариант просто пропускается, остальной файл продолжает грузиться.
   */
  variants: { created: number; updated: number; invalidVolume: RowError[] }
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
   * Форматы A/B: фото вариантов (колонка variant_image / поле image внутри
   * JSON-варианта). `missing` — построчный список ненайденных имён с handle и
   * объёмом: без него опечатка в имени файла уходит молча, а это главный риск
   * фичи — вариант просто тихо остаётся с общим фото товара.
   */
  variantImages: { attached: number; missing: RowError[] }
  /**
   * Форматы A/B: колонка country_of_origin.
   * `unknown` — значение не из списка (uae / europe / usa): товар всё равно
   * импортируется, поле не трогается. `conflicts` — внутри одного handle
   * строки указывают разные страны: берётся первая, остальные в отчёт.
   */
  country: { applied: number; unknown: RowError[]; conflicts: RowError[] }
  /**
   * Форматы A/B: колонка product_category — раздел каталога
   * (`Products.productCategory`), не таксономия `categories`.
   * Структура и правила те же, что у country: `unknown` — значение не из
   * списка (perfume / bodyCare), товар импортируется, поле не трогается;
   * `conflicts` — строки одного handle указывают разные разделы, берётся первая.
   */
  productCategory: { applied: number; unknown: RowError[]; conflicts: RowError[] }
  /**
   * Форматы A/B: колонка brand_logo. Область — БРЕНД, а не строка:
   * `applied` считает бренды (не строки файла), `missing` — имена, которых
   * нет в медиатеке, `conflicts` — строки одного бренда с разными именами
   * файлов (берётся первое).
   */
  brandLogos: { applied: number; missing: RowError[]; conflicts: RowError[] }
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
  variantImages: { attached: 0, missing: [] },
  country: { applied: 0, unknown: [], conflicts: [] },
  productCategory: { applied: 0, unknown: [], conflicts: [] },
  brandLogos: { applied: 0, missing: [], conflicts: [] },
  descriptionDuplicated: 0,
})
