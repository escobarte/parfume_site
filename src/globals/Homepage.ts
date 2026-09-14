import type { GlobalConfig, UploadField, Validate } from 'payload'
import { adminOnly, isAdmin, publicRead } from '@/access/roles'
import { internalLinkFields } from '@/fields/internalLink'
import { HOMEPAGE_TAG, revalidateCatalog } from '@/lib/revalidate'

/**
 * Картинка баннера обязательна, но НЕ в каждой локали: владелец может
 * загрузить одну картинку на одном языке, остальные локали покажут её же
 * (фолбэк на любую заполненную локаль — `src/lib/content/heroBanners.ts`).
 * Поэтому не `required: true`: Payload проверяет его в той локали, которую
 * сейчас редактируют, и заставил бы грузить картинку трижды.
 *
 * Проверка — «есть ли картинка у этой строки хоть в одной ДРУГОЙ локали»
 * по сохранённому документу. Текущая локаль исключается: иначе очистка
 * единственной картинки прошла бы проверку по ещё не перезаписанной базе.
 * Запрос к базе — только на сохранении, не на каждом изменении формы.
 */
const imageInSomeLocale: Validate<unknown, unknown, { id?: string | null }, UploadField> = async (
  value,
  { event, req, siblingData },
) => {
  if (value) return true
  if (event === 'onChange') return true

  const rowId = siblingData?.id
  if (rowId) {
    const saved = await req.payload.findGlobal({ slug: 'homepage', locale: 'all', depth: 0 })
    const row = (saved.heroBanners ?? []).find((banner) => banner.id === rowId)
    const byLocale = (row?.image ?? {}) as unknown as Record<string, unknown>
    const elsewhere = Object.entries(byLocale).some(
      ([locale, image]) => locale !== req.locale && Boolean(image),
    )
    if (elsewhere) return true
  }
  return 'Загрузите картинку баннера хотя бы на одном языке.'
}

/**
 * Главная страница — состав секций по docs/WIREFRAMES.md §Главная.
 * Порядок секций в вёрстке фиксирован, из админки управляется наполнение.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'Главная страница',
  admin: { group: 'Контент', hidden: ({ user }) => !isAdmin(user) },
  access: { read: publicRead, update: adminOnly },
  hooks: { afterChange: [() => revalidateCatalog(HOMEPAGE_TAG)] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Баннеры',
          fields: [
            {
              // Карусель вверху главной (2026-09-14) — заменила статичный hero,
              // акционный hero по датам и editorial-блок. Текст, заголовки и
              // CTA дизайнер вшивает прямо в картинку, отдельных полей нет.
              name: 'heroBanners',
              type: 'array',
              label: 'Баннеры',
              labels: { singular: 'Баннер', plural: 'Баннеры' },
              admin: {
                description:
                  'Карусель вверху главной. Порядок слайдов — порядок строк (перетаскиванием). Весь текст — на самой картинке. Один баннер — статичная картинка, пусто — секции нет.',
              },
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  label: 'Показывать',
                  defaultValue: true,
                  admin: { description: 'Снимите, чтобы временно скрыть баннер, не удаляя его.' },
                },
                {
                  // Безымянная группа — только рамка в админке: данные остаются
                  // плоскими (`image`, `imageTablet`, `imageMobile` у строки),
                  // поэтому у существующих баннеров путь `image` не меняется.
                  type: 'group',
                  label: 'Картинки',
                  admin: {
                    description:
                      'На экране всегда одна картинка — под ширину устройства. Планшетная и мобильная необязательны: где их нет ни на одном языке, показывается десктопная.',
                  },
                  fields: [
                    {
                      name: 'image',
                      type: 'upload',
                      relationTo: 'media',
                      localized: true,
                      label: 'Десктоп — экраны от 1024 px',
                      validate: imageInSomeLocale,
                      admin: {
                        description:
                          'Рекомендуемый размер 1920×800. Обязательно хотя бы на одном языке: где картинки нет, показывается загруженная на другом. Все десктопные баннеры — одной пропорции.',
                      },
                    },
                    {
                      name: 'imageTablet',
                      type: 'upload',
                      relationTo: 'media',
                      localized: true,
                      label: 'Планшет — 768–1023 px',
                      admin: {
                        description:
                          'Рекомендуемый размер 1024×768. Необязательно: пусто на всех языках — показывается десктопная. Загружайте планшетные сразу всем баннерам: у баннера без неё на планшете появятся поля сверху и снизу.',
                      },
                    },
                    {
                      name: 'imageMobile',
                      type: 'upload',
                      relationTo: 'media',
                      localized: true,
                      label: 'Мобильный — до 767 px',
                      admin: {
                        description:
                          'Рекомендуемый размер 750×1000. Необязательно: пусто на всех языках — показывается десктопная. Загружайте мобильные сразу всем баннерам: у баннера без неё на телефоне появятся поля сверху и снизу.',
                      },
                    },
                  ],
                },
                {
                  name: 'alt',
                  type: 'text',
                  localized: true,
                  label: 'Описание картинки (alt)',
                  admin: {
                    description:
                      'Коротко, что на картинке — для незрячих и поисковиков. Не повторяйте текст с баннера. Пусто — берётся alt файла из Медиа.',
                  },
                },
                ...internalLinkFields('link'),
              ],
            },
          ],
        },
        {
          label: 'Категории',
          fields: [
            {
              name: 'categoryTiles',
              type: 'array',
              label: 'Плитки категорий',
              maxRows: 4,
              admin: { description: 'Четыре плитки; счётчики товаров считаются из БД.' },
              fields: [
                {
                  name: 'category',
                  type: 'relationship',
                  relationTo: 'categories',
                  required: true,
                },
                {
                  name: 'labelOverride',
                  type: 'text',
                  localized: true,
                  admin: { description: 'Пусто — берётся название категории.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Товарные ряды',
          fields: [
            {
              name: 'newRow',
              type: 'group',
              label: 'Новинки',
              fields: [
                { name: 'title', type: 'text', localized: true, defaultValue: 'Новинки' },
                { name: 'linkLabel', type: 'text', localized: true },
                { name: 'limit', type: 'number', defaultValue: 4, min: 2, max: 12 },
              ],
            },
            {
              name: 'hitsRow',
              type: 'group',
              label: 'Хиты (опциональный слот)',
              admin: { description: 'WIREFRAMES.md §Опциональный слот — по умолчанию выключен.' },
              fields: [
                { name: 'enabled', type: 'checkbox', defaultValue: false },
                { name: 'title', type: 'text', localized: true, defaultValue: 'Хиты' },
                { name: 'linkLabel', type: 'text', localized: true },
                { name: 'limit', type: 'number', defaultValue: 4, min: 2, max: 12 },
              ],
            },
          ],
        },
        {
          label: 'Бренд-строка',
          fields: [
            {
              name: 'featuredBrands',
              type: 'relationship',
              relationTo: 'brands',
              hasMany: true,
              admin: { description: 'Одна центрированная строка названий без логотипов.' },
            },
          ],
        },
      ],
    },
  ],
}
