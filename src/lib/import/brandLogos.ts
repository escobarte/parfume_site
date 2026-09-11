import type { Payload, PayloadRequest } from 'payload'
import { slugify } from '@/lib/slugify'
import type { ImageResolver } from './images'
import type { RelationResolver } from './relations'
import type { ImportPlan } from './types'

/**
 * Колонка `brand_logo` — единственная в товарном CSV, которая пишет НЕ в
 * товар, а в другую коллекцию (`brands`). Отсюда всё её своеобразие:
 *
 * - **область действия — бренд, а не строка и не handle.** У бренда с 40
 *   товарами ячейка повторится в 40 строках; писать запись бренда 40 раз
 *   бессмысленно, поэтому имя файла запоминается один раз за прогон, а
 *   применяется пачкой после того, как все товары разобраны.
 * - **расхождение ловится по бренду.** Две строки одного бренда с разными
 *   именами файлов — почти наверняка опечатка; берём первую, вторую в отчёт
 *   (тот же принцип, что у страны внутри одного handle).
 * - пустая ячейка не трогает уже загруженное лого;
 * - имя не найдено в медиатеке — предупреждение, а не падение импорта:
 *   товары того же файла грузятся как обычно, лого просто не меняется.
 *
 * Под `productScalars.ts` это не подводится: там всё построено вокруг полей
 * товара, у которых канон — значение из короткого списка, а не имя файла.
 */
export class BrandLogoApplier {
  /** slug бренда → первое встреченное имя файла (канон) и строка файла. */
  private pending = new Map<string, { filename: string; line: number; brandRaw: string }>()

  /**
   * Запоминает ячейку строки. Ничего не пишет и не ходит в БД — вся работа
   * в `apply()`, чтобы один бренд обновлялся ровно один раз за прогон.
   */
  register(brandRaw: string, rawFilename: string | undefined, line: number, plan: ImportPlan) {
    const filename = rawFilename?.trim()
    if (!filename) return

    const slug = slugify(brandRaw)
    if (!slug) return

    const first = this.pending.get(slug)
    if (!first) {
      this.pending.set(slug, { filename, line, brandRaw })
      return
    }

    if (first.filename !== filename) {
      plan.brandLogos.conflicts.push({
        line,
        field: 'brand_logo',
        message: `${brandRaw}: строки указывают разные логотипы («${first.filename}» и «${filename}») — взят первый`,
      })
    }
  }

  /**
   * Привязывает накопленные логотипы. Вызывается ОДИН раз после разбора всех
   * товаров: к этому моменту `RelationResolver` уже знает id всех брендов
   * файла (включая только что автосозданные), лишних запросов не будет.
   *
   * В dry-run запись не делается, но статистика и предупреждения считаются
   * честно — отчёт проверки должен показывать то же, что покажет боевой
   * прогон. Исключение — бренд, которого ещё нет в базе: в dry-run
   * `RelationResolver` отдаёт маркер `-1` вместо id, привязывать не к чему;
   * такой случай считается применённым (бренд будет создан, лого ляжет на
   * него в боевом прогоне), молча, иначе отчёт пугал бы ложной ошибкой.
   */
  async apply(
    payload: Payload,
    resolver: RelationResolver,
    imageResolver: ImageResolver,
    plan: ImportPlan,
    dryRun: boolean,
    req?: Partial<PayloadRequest>,
  ): Promise<void> {
    for (const [, { filename, line, brandRaw }] of this.pending) {
      const mediaId = await imageResolver.resolveOne(filename)
      if (mediaId === null) {
        plan.brandLogos.missing.push({
          line,
          field: 'brand_logo',
          message: `${brandRaw}: файл «${filename}» не найден в медиатеке — логотип бренда не изменён`,
        })
        continue
      }

      const brandId = await resolver.resolve('brands', brandRaw)
      if (brandId === undefined) continue

      plan.brandLogos.applied += 1
      if (dryRun || brandId === -1) continue

      await payload.update({
        collection: 'brands',
        id: brandId,
        data: { logo: mediaId as number },
        req: req as PayloadRequest,
      })
    }
  }
}
