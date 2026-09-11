import type { CollectionConfig } from 'payload'
import { adminOnly, publicRead } from '@/access/roles'
import { seoField } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { revalidateTaxonomy } from '@/lib/revalidate'

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
    afterChange: [() => revalidateTaxonomy()],
    afterDelete: [() => revalidateTaxonomy()],
  },
  fields: [
    // title/description НЕ localized (решение владельца 2026-09-11): название
    // бренда одинаково на всех языках, а описание ведётся «для себя». Раньше
    // оба поля были локализованы, и бренд, заведённый в админке на одном
    // языке, приходил на остальные локали с пустым title — страница /brands
    // падала на нём (см. docs/GOTCHAS.md). Тот же принцип уже применён к
    // Notes.title/description (ПРОМПТ 13) и Products.title (фаза 8.1).
    { name: 'title', type: 'text', required: true, index: true },
    slugField(),
    { name: 'description', type: 'textarea' },
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
