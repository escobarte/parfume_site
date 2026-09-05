import type { CollectionConfig } from 'payload'
import { adminOnly, isStaff } from '@/access/roles'
import { slugField } from '@/fields/slug'
import { denormalizeVariants } from '@/lib/products/denormalize'
import { GIFT_TAG, revalidateCatalog } from '@/lib/revalidate'

/**
 * Подарочные сертификаты и Gift box (фаза 11.1, задача 2). Одна коллекция,
 * не `Products`/`Variants` — механизм вариантов скопирован (сумма в MDL
 * вместо объёма в мл), но это отдельные товары без фасетов «Кому»/«Ноты».
 * Разделение на два раздела — одним полем `type`, а не второй коллекцией
 * (тот же принцип, что `Products.productCategory`, фаза 11.1 задача 1).
 */
export const GIFT_ITEM_TYPES = [
  { label: 'Подарочный сертификат', value: 'certificate' },
  { label: 'Gift box', value: 'giftBox' },
] as const

export const GiftItems: CollectionConfig = {
  slug: 'gift-items',
  labels: { singular: 'Подарочный товар', plural: 'Подарочные товары' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'minPrice', 'isActive', 'updatedAt'],
    group: 'Каталог',
  },
  access: {
    // Как у Products: публике — только активные, сотрудникам — всё.
    read: ({ req: { user } }) => (isStaff(user) ? true : { isActive: { equals: true } }),
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const variants = (data?.variants ?? originalDoc?.variants) as
          | { amount?: number | null; stock?: number | null; isActive?: boolean | null }[]
          | undefined
        // denormalizeVariants — общая функция для Products (VariantLike
        // читает только price/oldPrice/stock/isActive, имя поля не важно),
        // amount подставляется в роль price, oldPrice у сертификатов нет.
        const { minPrice, maxPrice, inStock } = denormalizeVariants(
          (variants ?? []).map((variant) => ({
            price: variant.amount ?? null,
            oldPrice: null,
            stock: variant.stock,
            isActive: variant.isActive,
          })),
        )
        return { ...data, minPrice, maxPrice, inStock }
      },
    ],
    afterChange: [() => revalidateCatalog(GIFT_TAG)],
    afterDelete: [() => revalidateCatalog(GIFT_TAG)],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true, index: true },
    slugField(),
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'certificate',
      index: true,
      options: [...GIFT_ITEM_TYPES],
      admin: { description: 'Раздел витрины: «Подарочные сертификаты» или «Gift box».' },
    },
    { name: 'description', type: 'richText', localized: true },
    { name: 'image', type: 'upload', relationTo: 'media' },
    {
      name: 'variants',
      type: 'array',
      minRows: 1,
      required: true,
      labels: { singular: 'Номинал', plural: 'Номиналы' },
      admin: {
        description: 'Тот же механизм, что у вариантов товара — сумма в MDL вместо объёма.',
        initCollapsed: false,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'amount',
              type: 'number',
              required: true,
              min: 1,
              admin: { width: '34%', description: 'Номинал, MDL' },
            },
            {
              name: 'sku',
              type: 'text',
              required: true,
              index: true,
              admin: { width: '33%' },
            },
            {
              name: 'stock',
              type: 'number',
              required: true,
              defaultValue: 0,
              min: 0,
              admin: { width: '33%' },
            },
          ],
        },
        {
          name: 'isActive',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Показывать номинал на витрине.' },
        },
      ],
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { position: 'sidebar', description: 'Показывать товар на витрине.' },
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
        { name: 'minPrice', type: 'number', index: true, admin: { readOnly: true } },
        { name: 'maxPrice', type: 'number', index: true, admin: { readOnly: true } },
        {
          name: 'inStock',
          type: 'checkbox',
          defaultValue: false,
          index: true,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
