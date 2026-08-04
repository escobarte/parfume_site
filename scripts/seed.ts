import 'dotenv/config'
import { rm } from 'fs/promises'
import path from 'path'
import { getPayload, type Payload } from 'payload'
import config from '../src/payload.config.js'
import { brands, categories, notes, products, type Locales } from '../src/lib/seed/data.js'
import { makePlaceholder } from '../src/lib/seed/placeholder.js'
import { paragraphs } from '../src/lib/seed/richText.js'

const LOCALES = ['ro', 'ru', 'en'] as const
type Locale = (typeof LOCALES)[number]

const TMP_DIR = path.resolve(process.cwd(), '.seed-tmp')

/** Создать или обновить документ по slug; вернуть id. Seed идемпотентен. */
async function upsertBySlug(
  payload: Payload,
  collection: 'brands' | 'categories' | 'notes' | 'products',
  slug: string,
  byLocale: (locale: Locale) => Record<string, unknown>,
): Promise<number | string> {
  const existing = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    locale: 'ro',
  })

  const first = existing.docs[0]
  const id = first
    ? (
        await payload.update({
          collection,
          id: first.id,
          data: byLocale('ro') as never,
          locale: 'ro',
        })
      ).id
    : (await payload.create({ collection, data: byLocale('ro') as never, locale: 'ro' })).id

  for (const locale of LOCALES.filter((l) => l !== 'ro')) {
    await payload.update({ collection, id, data: byLocale(locale) as never, locale })
  }

  return id
}

async function seedAdmin(payload: Payload) {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@local.dev'
  const password = process.env.SEED_ADMIN_PASSWORD

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })

  if (existing.docs[0]) {
    // Роль могла остаться пустой после добавления поля — чиним молча.
    if (existing.docs[0].role !== 'admin') {
      await payload.update({
        collection: 'users',
        id: existing.docs[0].id,
        data: { role: 'admin' },
      })
    }
    return `админ ${email} уже есть`
  }

  if (!password) {
    return `⚠ админ ${email} не создан: задайте SEED_ADMIN_PASSWORD в .env`
  }

  await payload.create({ collection: 'users', data: { email, password, role: 'admin' } })
  return `создан админ ${email} (пароль — из .env)`
}

async function main() {
  const payload = await getPayload({ config })

  const adminInfo = await seedAdmin(payload)

  // ── Справочники ────────────────────────────────────────────────────────
  const brandIds = new Map<string, number | string>()
  for (const brand of brands) {
    const id = await upsertBySlug(payload, 'brands', brand.slug, (locale) => ({
      slug: brand.slug,
      title: brand.title,
      country: brand.country[locale],
      description: brand.description[locale],
      isFeatured: brand.isFeatured,
    }))
    brandIds.set(brand.slug, id)
  }

  const categoryIds = new Map<string, number | string>()
  for (const category of categories) {
    const id = await upsertBySlug(payload, 'categories', category.slug, (locale) => ({
      slug: category.slug,
      title: category.title[locale],
      description: category.description[locale],
      order: category.order,
    }))
    categoryIds.set(category.slug, id)
  }

  const noteIds = new Map<string, number | string>()
  for (const note of notes) {
    const id = await upsertBySlug(payload, 'notes', note.slug, (locale) => ({
      slug: note.slug,
      title: note.title[locale],
      group: note.group,
    }))
    noteIds.set(note.slug, id)
  }

  // ── Товары с плейсхолдер-картинками ───────────────────────────────────
  const localized = (value: Locales, locale: Locale) => value[locale]

  for (const product of products) {
    const existingMedia = await payload.find({
      collection: 'media',
      where: { filename: { like: `${product.slug}%` } },
      limit: 1,
      depth: 0,
    })

    let mediaId = existingMedia.docs[0]?.id
    if (!mediaId) {
      const filePath = await makePlaceholder(product.title, TMP_DIR, product.slug)
      const media = await payload.create({
        collection: 'media',
        locale: 'ro',
        filePath,
        data: { alt: `${product.title} — ${product.handle}` },
      })
      mediaId = media.id
      for (const locale of LOCALES.filter((l) => l !== 'ro')) {
        await payload.update({
          collection: 'media',
          id: mediaId,
          locale,
          data: { alt: `${product.title} — ${product.handle}` },
        })
      }
    }

    await upsertBySlug(payload, 'products', product.slug, (locale) => ({
      handle: product.handle,
      slug: product.slug,
      title: product.title,
      brand: brandIds.get(product.brand),
      categories: product.categories.map((slug) => categoryIds.get(slug)),
      gender: product.gender,
      family: product.family,
      notes: product.notes.map((slug) => noteIds.get(slug)),
      pyramid: {
        top: product.pyramid.top.map((slug) => noteIds.get(slug)),
        heart: product.pyramid.heart.map((slug) => noteIds.get(slug)),
        base: product.pyramid.base.map((slug) => noteIds.get(slug)),
      },
      description: paragraphs(localized(product.description, locale)),
      images: [mediaId],
      variants: product.variants.map((variant) => ({ ...variant, isActive: true })),
      isNew: product.isNew ?? false,
      isHit: product.isHit ?? false,
      isSale: product.isSale ?? false,
      _status: 'published',
    }))
  }

  await seedGlobals(payload, { brandIds, categoryIds })

  await rm(TMP_DIR, { recursive: true, force: true })

  const counts = await Promise.all(
    (['brands', 'categories', 'notes', 'products', 'media'] as const).map(async (collection) => {
      const { totalDocs } = await payload.count({ collection })
      return `${collection}: ${totalDocs}`
    }),
  )

  payload.logger.info(`Seed завершён — ${adminInfo}`)
  payload.logger.info(counts.join(' · '))
  process.exit(0)
}

async function seedGlobals(
  payload: Payload,
  refs: { brandIds: Map<string, number | string>; categoryIds: Map<string, number | string> },
) {
  const { brandIds, categoryIds } = refs

  const settings: Record<Locale, Record<string, unknown>> = {
    ro: {
      address: 'Chișinău, str. Ștefan cel Mare 1',
      workingHours: 'Luni–Sâmbătă, 10:00–19:00',
      footerNote: 'Scents that feel like you.',
    },
    ru: {
      address: 'Кишинёв, ул. Штефан чел Маре 1',
      workingHours: 'Пн–Сб, 10:00–19:00',
      footerNote: 'Scents that feel like you.',
    },
    en: {
      address: 'Chisinau, Stefan cel Mare st. 1',
      workingHours: 'Mon–Sat, 10:00–19:00',
      footerNote: 'Scents that feel like you.',
    },
  }

  for (const locale of LOCALES) {
    await payload.updateGlobal({
      slug: 'settings',
      locale,
      data: {
        siteName: 'MON FLACON',
        tagline: 'Perfumes for everyone',
        contacts: {
          phone: '+373 22 000 000',
          email: 'salut@monflacon.md',
          address: settings[locale].address as string,
          workingHours: settings[locale].workingHours as string,
        },
        messengers: { telegram: 'monflacon', viber: '+37322000000', whatsapp: '+37322000000' },
        footerNote: settings[locale].footerNote as string,
      },
    })
  }

  const nav: Record<Locale, { header: string[]; columns: string[][] }> = {
    ro: {
      header: ['Catalog', 'Branduri', 'Noutăți', 'Despre noi'],
      columns: [
        ['Catalog', 'Noutăți', 'Branduri', 'Ea', 'El'],
        ['Cumpărătorilor', 'Livrare', 'Plată', 'Retur', 'Contacte'],
      ],
    },
    ru: {
      header: ['Каталог', 'Бренды', 'Новинки', 'О нас'],
      columns: [
        ['Каталог', 'Новинки', 'Бренды', 'Она', 'Он'],
        ['Покупателям', 'Доставка', 'Оплата', 'Возврат', 'Контакты'],
      ],
    },
    en: {
      header: ['Catalog', 'Brands', 'New', 'About'],
      columns: [
        ['Catalog', 'New', 'Brands', 'For her', 'For him'],
        ['For customers', 'Delivery', 'Payment', 'Returns', 'Contacts'],
      ],
    },
  }

  const headerHrefs = ['/catalog', '/brands', '/catalog?new=1', '/about']
  const columnHrefs = [
    ['/catalog?new=1', '/brands', '/catalog/femei', '/catalog/barbati'],
    ['/delivery', '/payment', '/returns', '/contacts'],
  ]

  for (const locale of LOCALES) {
    await payload.updateGlobal({
      slug: 'navigation',
      locale,
      data: {
        header: nav[locale].header.map((label, index) => ({ label, href: headerHrefs[index] })),
        footerColumns: nav[locale].columns.map(([title, ...labels], columnIndex) => ({
          title,
          links: labels.map((label, linkIndex) => ({
            label,
            href: columnHrefs[columnIndex][linkIndex],
          })),
        })),
      },
    })
  }

  const home: Record<Locale, Record<string, string>> = {
    ro: {
      subtitle:
        'Galerie de parfumuri în Chișinău. Aroma este o alegere personală: explorați, încercați, găsiți-o pe a voastră.',
      cta: 'Deschide catalogul',
      newTitle: 'Noutăți',
      newLink: 'Vezi toate',
      editorialText: 'Fiecare aromă are un context: un oraș, o oră, o persoană.',
      editorialLink: 'Ghidul aromelor',
      hitsTitle: 'Populare',
    },
    ru: {
      subtitle:
        'Современная парфюмерная галерея в Кишинёве. Аромат — личный выбор: исследуйте, пробуйте, находите своё.',
      cta: 'Открыть каталог',
      newTitle: 'Новинки',
      newLink: 'Смотреть все',
      editorialText: 'У каждого аромата есть контекст: город, час, человек.',
      editorialLink: 'Гид по ароматам',
      hitsTitle: 'Хиты',
    },
    en: {
      subtitle:
        'A perfume gallery in Chisinau. Scent is a personal choice: explore, try, find your own.',
      cta: 'Open the catalog',
      newTitle: 'New arrivals',
      newLink: 'See all',
      editorialText: 'Every scent has a context: a city, an hour, a person.',
      editorialLink: 'Fragrance guide',
      hitsTitle: 'Bestsellers',
    },
  }

  for (const locale of LOCALES) {
    const text = home[locale]
    await payload.updateGlobal({
      slug: 'homepage',
      locale,
      data: {
        hero: {
          eyebrow: 'Perfumes for everyone',
          title: 'Find your signature.',
          subtitle: text.subtitle,
          ctaLabel: text.cta,
          ctaHref: '/catalog',
        },
        categoryTiles: categories.map((category) => ({ category: categoryIds.get(category.slug) })),
        newRow: { title: text.newTitle, linkLabel: text.newLink, limit: 4 },
        hitsRow: { enabled: false, title: text.hitsTitle, linkLabel: text.newLink, limit: 4 },
        editorial: {
          phrase: 'A scent for every story.',
          text: text.editorialText,
          linkLabel: text.editorialLink,
          linkHref: '/about',
        },
        featuredBrands: brands.map((brand) => brandIds.get(brand.slug)),
      } as never,
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
