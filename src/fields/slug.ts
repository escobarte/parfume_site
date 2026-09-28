import type { Field, TextFieldValidation } from 'payload'
import { slugify } from '@/lib/slugify'

/**
 * Slug — общий для всех локалей (PLAN.md §1: локализуются контент и SEO, не URL).
 * Если поле пустое, собирается из указанного источника (обычно title).
 *
 * `validate` — опциональная кастомная проверка сверху обычной (например,
 * список зарезервированных slug у `Pages`, 2026-09-28). Передавая её,
 * заменяешь дефолтную валидацию Payload целиком — включая проверку
 * `required`, поэтому такая функция обязана сама отвергать пустое значение.
 */
export const slugField = (from = 'title', options?: { validate?: TextFieldValidation }): Field => ({
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Латиницей, один на все локали. Пусто — соберётся из названия.',
  },
  ...(options?.validate ? { validate: options.validate } : {}),
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
