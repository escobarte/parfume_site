import type { CollectionConfig } from 'payload'
import { adminOnly, publicRead, staffOnly } from '@/access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Файл', plural: 'Медиа' },
  admin: { group: 'Каталог' },
  access: {
    read: publicRead,
    create: staffOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  upload: {
    mimeTypes: ['image/*'],
    focalPoint: true,
    // Размеры под витрину: превью в админке, карточка листинга, галерея товара.
    imageSizes: [
      { name: 'thumb', width: 300, height: 300, position: 'centre' },
      { name: 'card', width: 600, height: 600, position: 'centre' },
      { name: 'full', width: 1200 },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      localized: true,
      admin: { description: 'Альтернативный текст — локализуется.' },
    },
    { name: 'caption', type: 'text', localized: true },
  ],
}
