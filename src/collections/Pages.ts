import type { CollectionConfig } from 'payload'
import { adminOnly, publicRead } from '@/access/roles'
import { seoField } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { GLOBALS_TAG, revalidateCatalog } from '@/lib/revalidate'

/**
 * Статические страницы (О нас/Доставка/Возврат/Контакты, фаза 5.2) —
 * обычный редактируемый контент, а не хардкод в коде. Slug фиксирован под
 * системные цели `LINK_TARGETS` (about/delivery/contacts, src/lib/links.ts) —
 * маршруты живут по тем же путям, что уже зафиксированы в `TARGET_PATHS`.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Страница', plural: 'Страницы' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    group: 'Контент',
  },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    afterChange: [() => revalidateCatalog(GLOBALS_TAG)],
    afterDelete: [() => revalidateCatalog(GLOBALS_TAG)],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true, index: true },
    slugField(),
    { name: 'body', type: 'richText', localized: true },
    seoField,
  ],
}
