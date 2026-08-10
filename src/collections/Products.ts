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
            { name: 'title', type: 'text', required: true, localized: true, index: true },
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
        { name: 'isSale', type: 'checkbox', label: 'Акция', defaultValue: false, index: true },
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
