import type { Payload, PayloadRequest } from 'payload'

/**
 * Привязка колонки images (формат A/B) к уже загруженным файлам Media —
 * по точному имени файла (см. /admin/catalog-import, блок загрузки ZIP).
 * Никакого авто-создания: opечатка в имени — просто предупреждение в отчёте
 * (plan.images.missing), товар при этом импортируется без этого фото.
 */
export class ImageResolver {
  private cache = new Map<string, number | string | null>()

  constructor(
    private payload: Payload,
    private req?: Partial<PayloadRequest>,
  ) {}

  private async resolve(filename: string): Promise<number | string | null> {
    const cached = this.cache.get(filename)
    if (cached !== undefined) return cached

    const found = await this.payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
      req: this.req as PayloadRequest,
    })

    const id = found.docs[0]?.id ?? null
    this.cache.set(filename, id)
    return id
  }

  /** Порядок сохраняется — первое найденное имя становится обложкой карточки. */
  async resolveMany(
    filenames: string[] | undefined,
  ): Promise<{ ids: (number | string)[]; missing: string[] }> {
    if (!filenames?.length) return { ids: [], missing: [] }

    const ids: (number | string)[] = []
    const missing: string[] = []

    for (const name of filenames) {
      const id = await this.resolve(name)
      if (id === null) missing.push(name)
      else ids.push(id)
    }

    return { ids, missing }
  }
}
