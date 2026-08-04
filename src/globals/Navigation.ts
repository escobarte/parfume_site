import type { GlobalConfig } from 'payload'
import { adminOnly, isAdmin, publicRead } from '@/access/roles'

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Навигация',
  admin: { group: 'Контент', hidden: ({ user }) => !isAdmin(user) },
  access: { read: publicRead, update: adminOnly },
  fields: [
    {
      name: 'header',
      type: 'array',
      label: 'Меню в шапке',
      admin: { description: 'Каталог · Бренды · Новинки · О нас (WIREFRAMES.md §Шапка).' },
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
            {
              name: 'href',
              type: 'text',
              required: true,
              admin: { width: '50%', description: 'Без префикса локали: /catalog' },
            },
          ],
        },
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
