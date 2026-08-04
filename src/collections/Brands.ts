import type { CollectionConfig } from 'payload'
import { adminOnly, publicRead } from '@/access/roles'
import { seoField } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { revalidateCatalog } from '@/lib/revalidate'

export const Brands: CollectionConfig = {
  slug: 'brands',
  labels: { singular: 'Бренд', plural: 'Бренды' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'isFeatured', 'updatedAt'],
    group: 'Каталог',
  },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    afterChange: [() => revalidateCatalog()],
    afterDelete: [() => revalidateCatalog()],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true, index: true },
    slugField(),
    { name: 'description', type: 'textarea', localized: true },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    {
      name: 'country',
      type: 'text',
      localized: true,
      admin: { description: 'Страна бренда — для страницы бренда.' },
    },
    {
      name: 'isFeatured',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Показывать в бренд-строке на главной.' },
    },
    seoField,
  ],
}
