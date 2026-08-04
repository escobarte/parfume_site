import type { Field } from 'payload'
import { slugify } from '@/lib/slugify'

/**
 * Slug — общий для всех локалей (PLAN.md §1: локализуются контент и SEO, не URL).
 * Если поле пустое, собирается из указанного источника (обычно title).
 */
export const slugField = (from = 'title'): Field => ({
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Латиницей, один на все локали. Пусто — соберётся из названия.',
  },
  hooks: {
    beforeValidate: [
      ({ value, data, originalDoc }) => {
        if (typeof value === 'string' && value.trim()) return slugify(value)
        const source = (data?.[from] ?? originalDoc?.[from]) as unknown
        return typeof source === 'string' && source.trim() ? slugify(source) : value
      },
    ],
  },
})
