import type { Field } from 'payload'

/**
 * Локализованный SEO-блок. Пустые поля на витрине заполняются из title/description
 * (фаза 7 — generateMetadata), поэтому required здесь нет.
 */
export const seoField: Field = {
  name: 'seo',
  type: 'group',
  label: 'SEO',
  admin: { position: 'sidebar' },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: { description: 'До ~60 знаков. Пусто — берётся название.' },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      admin: { description: 'До ~160 знаков.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Картинка для OG-превью.' },
    },
  ],
}
