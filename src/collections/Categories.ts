import type { CollectionConfig } from 'payload'
import { adminOnly, publicRead } from '@/access/roles'
import { seoField } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { revalidateTaxonomy } from '@/lib/revalidate'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Категория', plural: 'Категории' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'parent', 'updatedAt'],
    group: 'Каталог',
  },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    afterChange: [() => revalidateTaxonomy()],
    afterDelete: [() => revalidateTaxonomy()],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true, index: true },
    slugField(),
    { name: 'description', type: 'textarea', localized: true },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      index: true,
      admin: { position: 'sidebar', description: 'Родительская категория (вложенность).' },
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Картинка плитки в ленте категорий на главной.' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'Порядок вывода, по возрастанию.' },
    },
    seoField,
  ],
}
