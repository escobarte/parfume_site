import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from '../src/payload.config.js'
import { brands, categories } from '../src/lib/seed/data.js'
import { makePlaceholder } from '../src/lib/seed/placeholder.js'
import { paragraphs } from '../src/lib/seed/richText.js'
import { VOLUME_VALUES, type VolumeValue } from '../src/lib/catalog/volume.js'

/**
 * Нагрузочный smoke (PLAN.md §8.3, Приложение A): 120 синтетических товаров
 * по 5 вариантов (600 SKU, было 6/720 до ПРОМПТ 12-дополнения — объём теперь
 * фиксированный список из 5 значений, шестого варианта взять неоткуда без
 * дублирования кода объёма) поверх демо-данных фазы 2 — замер отклика
 * листинга/фильтров/поиска/админки на объёме, близком к реальному прайсу.
 * Товары помечены slug `load-NNN` — удаляются одним запросом (см.
 * docs/perf/full-load.md, «как откатить»). Одна общая плейсхолдер-картинка
 * на все товары: цель — нагрузить БД и рендер списков, не генератор картинок.
 */
const LOCALES = ['ro', 'ru', 'en'] as const
type Locale = (typeof LOCALES)[number]

const COUNT = Number(process.env.LOAD_COUNT ?? 120)
// Множитель для цены — не сам объём (тот теперь код, не число), просто
// сохраняет прежний разброс цен по позиции варианта в списке.
const VOLUME_PRICE_FACTOR = [5, 10, 20, 40, 60]
const GENDERS = ['female', 'male', 'unisex'] as const
const FAMILIES = ['floral', 'woody', 'oriental', 'fresh', 'fougere', 'chypre'] as const

const DESCRIPTION: Record<Locale, string> = {
  ro: 'Compoziție de test generată pentru verificarea performanței catalogului la volum mare.',
  ru: 'Тестовая композиция, сгенерированная для проверки производительности каталога на большом объёме.',
  en: 'Synthetic composition generated to test catalog performance at scale.',
}

async function idsBySlug(
  payload: Payload,
  collection: 'brands' | 'categories',
  slugs: string[],
): Promise<Map<string, number | string>> {
  const map = new Map<string, number | string>()
  for (const slug of slugs) {
    const found = await payload.find({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })
    if (found.docs[0]) map.set(slug, found.docs[0].id)
  }
  return map
}

async function main() {
  const payload = await getPayload({ config })

  const brandIds = await idsBySlug(
    payload,
    'brands',
    brands.map((b) => b.slug),
  )
  const categoryIds = await idsBySlug(
    payload,
    'categories',
    categories.map((c) => c.slug),
  )
  const brandSlugs = [...brandIds.keys()]
  const categorySlugs = [...categoryIds.keys()]

  const existingMedia = await payload.find({
    collection: 'media',
    where: { filename: { equals: 'load-placeholder.png' } },
    limit: 1,
    depth: 0,
  })
  let mediaId = existingMedia.docs[0]?.id
  if (!mediaId) {
    const filePath = await makePlaceholder('LOAD TEST', '.seed-tmp', 'load-placeholder')
    const media = await payload.create({
      collection: 'media',
      locale: 'ro',
      filePath,
      data: { alt: 'Load test placeholder' },
    })
    mediaId = media.id
  }

  const started = Date.now()
  for (let i = 1; i <= COUNT; i += 1) {
    const num = String(i).padStart(3, '0')
    const slug = `load-${num}`
    const brandSlug = brandSlugs[i % brandSlugs.length]
    const categorySlug = categorySlugs[i % categorySlugs.length]
    const gender = GENDERS[i % GENDERS.length]
    const family = FAMILIES[i % FAMILIES.length]
    const basePrice = 150 + (i % 20) * 15

    const variants = VOLUME_VALUES.map((volume: VolumeValue, vi) => ({
      volume,
      sku: `LOAD-${num}-${volume}`,
      price: Math.round((basePrice * VOLUME_PRICE_FACTOR[vi]) / 100) * 10,
      stock: (i + vi) % 9,
      isActive: true,
    }))

    const title: Record<Locale, string> = {
      ro: `Test Parfum ${num}`,
      ru: `Тест Парфюм ${num}`,
      en: `Test Parfum ${num}`,
    }

    const dataFor = (locale: Locale) => ({
      handle: `LOAD-${num}`,
      slug,
      title: title[locale],
      brand: brandIds.get(brandSlug),
      categories: [categoryIds.get(categorySlug)],
      gender,
      family,
      description: paragraphs(DESCRIPTION[locale]),
      images: [mediaId],
      variants,
      isNew: i % 5 === 0,
      isHit: i % 7 === 0,
      _status: 'published' as const,
    })

    const existing = await payload.find({
      collection: 'products',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      locale: 'ro',
    })

    const id = existing.docs[0]
      ? (
          await payload.update({
            collection: 'products',
            id: existing.docs[0].id,
            data: dataFor('ro') as never,
            locale: 'ro',
          })
        ).id
      : (await payload.create({ collection: 'products', data: dataFor('ro') as never, locale: 'ro' }))
          .id

    for (const locale of LOCALES.filter((l) => l !== 'ro')) {
      await payload.update({ collection: 'products', id, data: dataFor(locale) as never, locale })
    }

    if (i % 20 === 0) payload.logger.info(`load-seed: ${i}/${COUNT}`)
  }

  const { totalDocs } = await payload.count({ collection: 'products' })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  payload.logger.info(
    `Готово за ${elapsed}s: ${COUNT} тестовых товаров (${COUNT * VOLUME_VALUES.length} SKU). Всего products: ${totalDocs}`,
  )
  process.exit(0)
}

main()
