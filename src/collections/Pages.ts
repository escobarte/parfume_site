import type { CollectionConfig, TextFieldValidation } from 'payload'
import { adminOnly, publicRead } from '@/access/roles'
import { seoField } from '@/fields/seo'
import { slugField } from '@/fields/slug'
import { RESERVED_PAGE_SLUGS } from '@/lib/content/pages'
import { GLOBALS_TAG, revalidateCatalog } from '@/lib/revalidate'

/**
 * Статические страницы (О нас/Доставка/Возврат/Контакты + любые новые,
 * фаза 5.2 → 2026-09-28) — обычный редактируемый контент, а не хардкод в
 * коде. С 2026-09-28 любой документ открывается по общему маршруту
 * `[locale]/[slug]`; четыре системных (about/delivery/contacts/returns,
 * `LINK_TARGETS`/`SYSTEM_PAGE_SLUGS`) живут на собственных статических
 * путях, которые выигрывают у `[slug]` сами.
 */

/**
 * Заменяет дефолтную валидацию Payload целиком (см. `docs/GOTCHAS.md` —
 * кастомный `validate` отменяет встроенную проверку `required`, поэтому
 * пустое значение проверяется здесь же, а не полагается на `required: true`
 * у поля).
 */
const validateSlug: TextFieldValidation = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed)
    return 'Slug обязателен — заполните «Title», он соберётся сам, либо впишите вручную.'
  if ((RESERVED_PAGE_SLUGS as readonly string[]).includes(trimmed)) {
    return `Slug «${trimmed}» зарезервирован системным маршрутом сайта — выберите другой адрес страницы.`
  }
  return true
}

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
    slugField('title', { validate: validateSlug }),
    { name: 'body', type: 'richText', localized: true },
    seoField,
  ],
}
