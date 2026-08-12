import type { GlobalConfig } from 'payload'
import { adminOnly, isAdmin, publicRead } from '@/access/roles'
import { internalLinkFields } from '@/fields/internalLink'
import { GLOBALS_TAG, revalidateCatalog } from '@/lib/revalidate'

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Навигация',
  admin: { group: 'Контент', hidden: ({ user }) => !isAdmin(user) },
  access: { read: publicRead, update: adminOnly },
  hooks: { afterChange: [() => revalidateCatalog(GLOBALS_TAG)] },
  fields: [
    {
      name: 'header',
      type: 'array',
      label: 'Меню в шапке',
      admin: { description: 'Каталог · Бренды · Новинки · О нас (WIREFRAMES.md §Шапка).' },
      fields: [
        { name: 'label', type: 'text', required: true, localized: true },
        ...internalLinkFields('target'),
      ],
    },
    {
      name: 'footerColumns',
      type: 'array',
      label: 'Колонки футера',
      maxRows: 3,
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        {
          name: 'links',
          type: 'array',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'label',
                  type: 'text',
                  required: true,
                  localized: true,
                  admin: { width: '50%' },
                },
                { name: 'href', type: 'text', required: true, admin: { width: '50%' } },
              ],
            },
          ],
        },
      ],
    },
  ],
}
