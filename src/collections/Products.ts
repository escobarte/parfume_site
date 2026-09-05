import type { CollectionConfig } from 'payload'
import { adminOnly, isStaff, staffOnly } from '@/access/roles'
import { seoField } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { denormalizeVariants, type VariantLike } from '@/lib/products/denormalize'
import { revalidateCatalog } from '@/lib/revalidate'

export const FRAGRANCE_FAMILIES = [
  { label: 'Цветочный', value: 'floral' },
  { label: 'Древесный', value: 'woody' },
  { label: 'Восточный', value: 'oriental' },
  { label: 'Свежий', value: 'fresh' },
  { label: 'Фужерный', value: 'fougere' },
  { label: 'Шипровый', value: 'chypre' },
] as const

export const GENDERS = [
  { label: 'Она', value: 'female' },
  { label: 'Он', value: 'male' },
  { label: 'Унисекс', value: 'unisex' },
  { label: 'Детям', value: 'kids' },
] as const

// Тип товара — не «Кому» (пол), а категория назначения. Дефолт совпадает
// с прежним неявным поведением (все текущие ~100+ товаров — парфюмерия),
// поэтому обратная миграция бэкфилится без ручной сверки (фаза 11, задача 1).
export const PRODUCT_CATEGORIES = [
  { label: 'Парфюмерия', value: 'perfume' },
  { label: 'Уход за телом', value: 'bodyCare' },
] as const

// Страна-производитель — новый фасет каталога (фаза 11.1, задача 3). Дефолт
// 'europe' — так же, как выше: бэкфилл существующих ~100+ товаров без ручной
// сверки (демо-каталог сейчас преимущественно европейские бренды).
export const PRODUCT_COUNTRIES = [
  { label: 'ОАЭ', value: 'uae' },
  { label: 'Европа', value: 'europe' },
  { label: 'США', value: 'usa' },
] as const

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: 'Товар', plural: 'Товары' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'brand', 'minPrice', 'inStock', '_status', 'updatedAt'],
    group: 'Каталог',
    listSearchableFields: ['title', 'handle', 'slug'],
  },
  versions: { drafts: true },
  access: {
    // Публике — только опубликованные; сотрудникам — всё.
    read: ({ req: { user } }) => (isStaff(user) ? true : { _status: { equals: 'published' } }),
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
    readVersions: staffOnly,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const variants = (data?.variants ?? originalDoc?.variants) as VariantLike[] | undefined
        return { ...data, ...denormalizeVariants(variants) }
      },
    ],
    afterChange: [() => revalidateCatalog()],
    afterDelete: [() => revalidateCatalog()],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Основное',
          fields: [
            // Название общее на все локали (не переводится). См. GOTCHAS.
            { name: 'title', type: 'text', required: true, index: true },
            {
              name: 'brand',
              type: 'relationship',
              relationTo: 'brands',
              required: true,
              index: true,
            },
            {
              name: 'categories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
              index: true,
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'gender',
                  type: 'select',
                  index: true,
                  options: [...GENDERS],
                  admin: { width: '50%' },
                },
                {
                  name: 'family',
                  type: 'select',
                  index: true,
                  options: [...FRAGRANCE_FAMILIES],
                  admin: { width: '50%', description: 'Ольфакторное семейство.' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'productCategory',
                  type: 'select',
                  index: true,
                  required: true,
                  defaultValue: 'perfume',
                  options: [...PRODUCT_CATEGORIES],
                  admin: {
                    width: '50%',
                    description: 'Раздел каталога (не «Кому») — влияет на левую навигацию.',
                  },
                },
                {
                  name: 'countryOfOrigin',
                  type: 'select',
                  index: true,
                  required: true,
                  defaultValue: 'europe',
                  options: [...PRODUCT_COUNTRIES],
                  admin: { width: '50%', description: 'Страна-производитель — фасет каталога.' },
                },
              ],
            },
            { name: 'description', type: 'richText', localized: true },
            {
              name: 'images',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
              admin: { description: 'Первая картинка — обложка карточки.' },
            },
          ],
        },
        {
          label: 'Варианты',
          fields: [
            {
              name: 'variants',
              type: 'array',
              minRows: 1,
              required: true,
              labels: { singular: 'Вариант', plural: 'Варианты' },
              admin: {
                description: 'Объём, цена и остаток. Общие для всех локалей.',
                initCollapsed: false,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'volume',
                      type: 'number',
                      required: true,
                      min: 1,
                      admin: { width: '25%', description: 'мл' },
                    },
                    {
                      name: 'sku',
                      type: 'text',
                      required: true,
                      index: true,
                      admin: { width: '25%' },
                    },
                    {
                      name: 'price',
                      type: 'number',
                      required: true,
                      min: 0,
                      admin: { width: '25%', description: 'MDL' },
                    },
                    {
                      name: 'oldPrice',
                      type: 'number',
                      min: 0,
                      admin: { width: '25%', description: 'MDL, до скидки' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'stock',
                      type: 'number',
                      required: true,
                      defaultValue: 0,
                      min: 0,
                      admin: { width: '50%' },
                    },
                    {
                      name: 'isActive',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '50%', description: 'Показывать вариант на витрине.' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Ноты',
          fields: [
            {
              name: 'notes',
              type: 'relationship',
              relationTo: 'notes',
              hasMany: true,
              index: true,
              admin: { description: 'Плоский список — по нему работают фильтры и карточка.' },
            },
            {
              name: 'pyramid',
              type: 'group',
              label: 'Пирамида нот',
              admin: { description: 'Необязательно. Для страницы товара.' },
              fields: [
                { name: 'top', type: 'relationship', relationTo: 'notes', hasMany: true },
                { name: 'heart', type: 'relationship', relationTo: 'notes', hasMany: true },
                { name: 'base', type: 'relationship', relationTo: 'notes', hasMany: true },
              ],
            },
          ],
        },
      ],
    },

    // ── Сайдбар ──────────────────────────────────────────────────────────
    {
      name: 'handle',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Ключ строки прайса клиента. По нему идёт upsert при импорте.',
      },
    },
    slugField(),
    {
      type: 'collapsible',
      label: 'Флаги',
      admin: { position: 'sidebar', initCollapsed: false },
      fields: [
        { name: 'isNew', type: 'checkbox', label: 'Новинка', defaultValue: false, index: true },
        { name: 'isHit', type: 'checkbox', label: 'Хит', defaultValue: false, index: true },
        // Ручного тега «Sale»/«Акция» больше нет (фаза 4.5, правка): он путал
        // рядом с авто-фасетом «со скидкой». Единственный источник —
        // денормализованный hasDiscount ниже, в UI подписан как Sale.
      ],
    },
    {
      type: 'collapsible',
      label: 'Денормализация (только чтение)',
      admin: {
        position: 'sidebar',
        initCollapsed: true,
        description: 'Считается хуком из вариантов, руками не заполняется.',
      },
      fields: [
        {
          name: 'minPrice',
          type: 'number',
          index: true,
          admin: { readOnly: true },
        },
        { name: 'maxPrice', type: 'number', index: true, admin: { readOnly: true } },
        {
          name: 'inStock',
          type: 'checkbox',
          defaultValue: false,
          index: true,
          admin: { readOnly: true },
        },
        {
          name: 'hasDiscount',
          type: 'checkbox',
          defaultValue: false,
          index: true,
          admin: { readOnly: true, description: 'Есть активный вариант с oldPrice > price.' },
        },
        {
          name: 'maxDiscountPercent',
          type: 'number',
          defaultValue: 0,
          index: true,
          admin: { readOnly: true, description: 'Максимальный % скидки среди активных вариантов.' },
        },
      ],
    },
    seoField,
  ],
}
