import type { CollectionConfig } from 'payload'
import { adminOnly, publicRead } from '@/access/roles'
import { slugField } from '@/fields/slug'
import { revalidateTaxonomy } from '@/lib/revalidate'

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
    afterChange: [() => revalidateTaxonomy()],
    afterDelete: [() => revalidateTaxonomy()],
  },
  fields: [
    { name: 'title', type: 'text', required: true, index: true },
    slugField(),
    { name: 'description', type: 'textarea' },
    { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'Иконка ноты.' } },
    {
      name: 'needsReview',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
        description:
          'Заготовка без проверки — название/иконка ещё не готовы или не вычитаны. Снимается вручную.',
      },
    },
    {
      // Раньше фиксированный select (citrus/floral/woody/spicy/sweet/fresh/
      // animalic) — снят по решению владельца (ПРОМПТ 12 v2): реальные
      // категории иконок от дизайнера (citrus/floral/fruity/green-aromatic/
      // woods-resin-base/gourmand-abstract/amber-molecules/musk-molecules и
      // т.д.) не укладываются в 7 старых значений и список будет расти —
      // свободный текст/тэг вместо закрытого enum. Старые значения перенесены
      // как есть миграцией, дословно (см. src/migrations/…phase12_notes_…).
      name: 'group',
      type: 'text',
      index: true,
      admin: { position: 'sidebar', description: 'Группа ноты — свободный текст, не список.' },
    },
  ],
}
