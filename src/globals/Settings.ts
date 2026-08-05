import type { GlobalConfig } from 'payload'
import { adminOnly, isAdmin, publicRead } from '@/access/roles'
import { GLOBALS_TAG, revalidateCatalog } from '@/lib/revalidate'

export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Настройки сайта',
  admin: { group: 'Контент', hidden: ({ user }) => !isAdmin(user) },
  access: { read: publicRead, update: adminOnly },
  hooks: { afterChange: [() => revalidateCatalog(GLOBALS_TAG)] },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      defaultValue: 'MON FLACON',
      admin: { description: 'Название бренда — не переводится (BRAND.md §7).' },
    },
    {
      name: 'tagline',
      type: 'text',
      defaultValue: 'Perfumes for everyone',
      admin: { description: 'Дескриптор логотипа — фирменная EN-фраза, не переводится.' },
    },
    {
      name: 'contacts',
      type: 'group',
      label: 'Контакты',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'phone', type: 'text', admin: { width: '50%' } },
            { name: 'email', type: 'email', admin: { width: '50%' } },
          ],
        },
        { name: 'address', type: 'text', localized: true },
        { name: 'workingHours', type: 'text', localized: true },
        { name: 'mapUrl', type: 'text', admin: { description: 'Ссылка на карту.' } },
      ],
    },
    {
      name: 'messengers',
      type: 'group',
      label: 'Мессенджеры',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'telegram', type: 'text', admin: { width: '33%' } },
            { name: 'viber', type: 'text', admin: { width: '33%' } },
            { name: 'whatsapp', type: 'text', admin: { width: '33%' } },
          ],
        },
      ],
    },
    {
      name: 'social',
      type: 'array',
      label: 'Соцсети',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '50%' } },
            { name: 'url', type: 'text', required: true, admin: { width: '50%' } },
          ],
        },
      ],
    },
    {
      name: 'footerNote',
      type: 'text',
      localized: true,
      admin: { description: 'Строка под логотипом в футере.' },
    },
  ],
}
