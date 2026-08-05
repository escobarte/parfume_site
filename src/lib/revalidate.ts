/**
 * Теги ревалидации каталога. Payload живёт внутри Next, поэтому хуки коллекций
 * зовут revalidateTag напрямую — вебхуки не нужны (PLAN.md §4.1).
 *
 * Важно: seed и CSV-импорт запускаются вне Next-рантайма, там revalidateTag
 * бросает исключение — оно намеренно гасится, кэша в тот момент не существует.
 */
export const CATALOG_TAG = 'products'
/** Справочники витрины: бренды, категории, ноты. */
export const TAXONOMY_TAG = 'taxonomy'
/** Глобалы: settings, navigation. */
export const GLOBALS_TAG = 'globals'
export const HOMEPAGE_TAG = 'homepage'

export async function revalidateCatalog(tag: string = CATALOG_TAG): Promise<void> {
  try {
    const { revalidateTag } = await import('next/cache')
    // Next 16 требует профиль кэша вторым аргументом; 'max' — сбросить всё по тегу.
    revalidateTag(tag, 'max')
  } catch {
    // вне запроса Next (CLI-скрипты) — ревалидировать нечего
  }
}

/** Справочник изменился — устарели и его списки, и выдача каталога. */
export async function revalidateTaxonomy(): Promise<void> {
  await revalidateCatalog(CATALOG_TAG)
  await revalidateCatalog(TAXONOMY_TAG)
}
