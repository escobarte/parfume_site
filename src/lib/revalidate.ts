/**
 * Теги ревалидации каталога. Payload живёт внутри Next, поэтому хуки коллекций
 * зовут revalidateTag напрямую — вебхуки не нужны (PLAN.md §4.1).
 *
 * Важно: seed и CSV-импорт запускаются вне Next-рантайма, там revalidateTag
 * бросает исключение — оно намеренно гасится, кэша в тот момент не существует.
 */
export const CATALOG_TAG = 'products'
/** Подарочные сертификаты / Gift box (фаза 11.1, задача 2) — отдельная коллекция. */
export const GIFT_TAG = 'gift-items'
/** Справочники витрины: бренды, категории, ноты. */
export const TAXONOMY_TAG = 'taxonomy'
/** Глобалы: settings, navigation. */
export const GLOBALS_TAG = 'globals'
export const HOMEPAGE_TAG = 'homepage'

/** Все теги витрины — для полного сброса (кнопка в /admin, импорт, кампании). */
export const ALL_TAGS = [CATALOG_TAG, GIFT_TAG, TAXONOMY_TAG, GLOBALS_TAG, HOMEPAGE_TAG] as const

/**
 * Единственная точка сброса кэша витрины в проекте (2026-09-20).
 *
 * **Почему `{ expire: 0 }`, а не профиль `'max'`.** В Next 16
 * `revalidateTag(tag, profile)` кладёт в кэш-хендлер `durations = { expire:
 * <из профиля> }`. У профиля `max` `expire` — «никогда», то есть `undefined`,
 * и `FileSystemCache.revalidateTag` проставляет записи только `stale`, но НЕ
 * `expired`. А решение «отдавать ли старое» принимает `areTagsExpired()`,
 * которая смотрит исключительно на `expired`. Итог: после `'max'` ближайший
 * запрос получал прежний ответ, а пересчёт уходил в фон — ровно тот
 * stale-while-revalidate, из-за которого страницу приходилось обновлять по
 * три-четыре раза. `{ expire: 0 }` ставит `expired = now`, запись считается
 * протухшей сразу, и **первый же** запрос пересчитывает данные.
 *
 * `updateTag()` здесь применить нельзя: он работает только внутри Server
 * Action, а все наши точки сброса — это route handler'ы Payload и хуки
 * коллекций (Next бросает E872 на любом маршруте, чей путь кончается
 * на «/route»).
 *
 * `revalidatePath('/', 'layout')` добавлен сверху тегов: он гасит неявный
 * тег всего дерева под корневым layout — полный кэш маршрутов и клиентский
 * роутер-кэш, до которых теги данных не достают.
 */
async function expireTags(tags: readonly string[]): Promise<void> {
  try {
    const { revalidatePath, revalidateTag } = await import('next/cache')
    for (const tag of tags) revalidateTag(tag, { expire: 0 })
    revalidatePath('/', 'layout')
  } catch {
    // вне запроса Next (CLI-скрипты) — ревалидировать нечего
  }
}

export async function revalidateCatalog(tag: string = CATALOG_TAG): Promise<void> {
  await expireTags([tag])
}

/** Справочник изменился — устарели и его списки, и выдача каталога. */
export async function revalidateTaxonomy(): Promise<void> {
  await expireTags([CATALOG_TAG, TAXONOMY_TAG])
}

/**
 * Сброс кэша всей витрины разом — все теги, а не только каталог.
 * Используется явной кнопкой в /admin (см. src/endpoints/adminCatalog.ts) для
 * случаев, когда обычные хуки коллекций не сработали: CLI-импорт/`pnpm seed`
 * (отдельный процесс, см. комментарий выше) или прямая правка БД в обход Payload.
 */
export async function revalidateAll(): Promise<void> {
  await expireTags(ALL_TAGS)
}
