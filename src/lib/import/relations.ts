import type { Payload, PayloadRequest } from 'payload'
import { slugify } from '@/lib/slugify'

type RelationCollection = 'brands' | 'categories' | 'notes'

/** Из slug делаем человекочитаемое название на случай авто-создания. */
const titleFromSlug = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/**
 * Кэш связей на один прогон импорта: slug → id.
 * Отсутствующие справочники создаются автоматически (ТЗ §4.7), список
 * созданных попадает в отчёт, чтобы клиент увидел опечатки в slug-ах.
 */
export class RelationResolver {
  private cache = new Map<string, number | string>()
  readonly created: Record<RelationCollection, string[]> = { brands: [], categories: [], notes: [] }

  constructor(
    private payload: Payload,
    private locale: string,
    private dryRun: boolean,
    private req?: Partial<PayloadRequest>,
  ) {}

  private key = (collection: RelationCollection, slug: string) => `${collection}:${slug}`

  async resolve(
    collection: RelationCollection,
    rawSlug: string,
  ): Promise<number | string | undefined> {
    const slug = slugify(rawSlug)
    if (!slug) return undefined

    const cached = this.cache.get(this.key(collection, slug))
    if (cached !== undefined) return cached

    const existing = await this.payload.find({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      locale: this.locale as 'ro',
      req: this.req as PayloadRequest,
    })

    const found = existing.docs[0]
    if (found) {
      this.cache.set(this.key(collection, slug), found.id)
      return found.id
    }

    if (!this.created[collection].includes(slug)) this.created[collection].push(slug)

    if (this.dryRun) {
      // В dry-run ничего не пишем: возвращаем маркер «будет создано».
      this.cache.set(this.key(collection, slug), -1)
      return -1
    }

    const doc = await this.payload.create({
      collection,
      locale: this.locale as 'ro',
      data: (collection === 'notes'
        ? { slug, title: titleFromSlug(slug), needsReview: true }
        : { slug, title: titleFromSlug(slug) }) as never,
      req: this.req as PayloadRequest,
    })

    // Ноты — заготовка получает временное название на ВСЕХ трёх локалях
    // (не только в локали импорта), чтобы карточка товара не показывала
    // пустую иконку с текстом только на одном языке (ПРОМПТ 12 v2, задача 2).
    // Бренды/категории так не делают — их title всегда был single-locale-first
    // и это поведение не менялось.
    if (collection === 'notes') {
      const otherLocales = (['ro', 'ru', 'en'] as const).filter((l) => l !== this.locale)
      for (const otherLocale of otherLocales) {
        await this.payload.update({
          collection,
          id: doc.id,
          locale: otherLocale,
          data: { title: titleFromSlug(slug) } as never,
          req: this.req as PayloadRequest,
        })
      }
    }

    this.cache.set(this.key(collection, slug), doc.id)
    return doc.id
  }

  async resolveMany(
    collection: RelationCollection,
    slugs: string[] | undefined,
  ): Promise<(number | string)[]> {
    if (!slugs?.length) return []
    const ids = await Promise.all(slugs.map((slug) => this.resolve(collection, slug)))
    return ids.filter((id): id is number | string => id !== undefined && id !== -1)
  }
}
