import type { CollectionConfig } from 'payload'
import { adminOnly, publicRead } from '@/access/roles'
import { slugField } from '@/fields/slug'
import { revalidateCatalog } from '@/lib/revalidate'

export const Notes: CollectionConfig = {
  slug: 'notes',
  labels: { singular: 'Нота', plural: 'Ноты' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'group', 'updatedAt'],
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
    {
      name: 'group',
      type: 'select',
      index: true,
      admin: { position: 'sidebar', description: 'Группа ноты — для навигации по нотам.' },
      options: [
        { label: 'Цитрусовые', value: 'citrus' },
        { label: 'Цветочные', value: 'floral' },
        { label: 'Древесные', value: 'woody' },
        { label: 'Пряные', value: 'spicy' },
        { label: 'Сладкие', value: 'sweet' },
        { label: 'Свежие', value: 'fresh' },
        { label: 'Животные', value: 'animalic' },
      ],
    },
  ],
}
