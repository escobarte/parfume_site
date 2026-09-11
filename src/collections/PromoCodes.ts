import type { CollectionConfig, TextFieldValidation, DateFieldValidation } from 'payload'
import { adminOnly, staffOnly } from '@/access/roles'

/**
 * Промокоды. Скидка только процентная (без фикс. суммы). С 2026-09-11 у кода
 * есть ТИП, и от него зависит, какие ограничения вообще проверяются:
 *
 * - **`personal`** — персональный код из попапа «первая скидка». Создаётся
 *   бэкендом (`/api/promo-popup`), привязан к email + телефону, одноразовый
 *   (`isUsed`), **срока действия не имеет** — `expiresAt` для него не
 *   заполняется и не проверяется.
 * - **`public`** — публичный код для соцсетей. Заводится руками в `/admin`,
 *   без привязки к человеку, **без ограничения на число применений**
 *   (`isUsed` не выставляется и не проверяется), единственное ограничение —
 *   обязательный `expiresAt`.
 *
 * Ветвление живёт в `resolvePromoCode()` (`src/lib/orders/promo.ts`) — здесь
 * только схема и условная обязательность полей.
 *
 * Регистронезависимость — не ILIKE на каждый запрос, а нормализация: код
 * всегда хранится и сравнивается в верхнем регистре (`beforeChange` ниже +
 * `normalizePromoCode()`).
 */

export const PROMO_CODE_TYPES = [
  { label: 'Персональный (из попапа)', value: 'personal' },
  { label: 'Публичный (соцсети)', value: 'public' },
] as const

export type PromoCodeType = (typeof PROMO_CODE_TYPES)[number]['value']

const isPersonal = (data: unknown) =>
  (data as { codeType?: string } | undefined)?.codeType === 'personal'
const isPublic = (data: unknown) =>
  (data as { codeType?: string } | undefined)?.codeType === 'public'

/**
 * Обязательность зависит от типа, а декларативный `required: true` условным
 * быть не умеет — проверяем в `validate`. Без этого публичный код нельзя было
 * бы сохранить без email, а персональный — без срока действия.
 */
const requiredForPersonal =
  (label: string): TextFieldValidation =>
  (value, { data }) => {
    if (!isPersonal(data)) return true
    return typeof value === 'string' && value.trim() ? true : `${label}: обязательно для персонального кода`
  }

const expiresRequiredForPublic: DateFieldValidation = (value, { data }) => {
  if (!isPublic(data)) return true
  return value ? true : 'Действует до: обязательно для публичного кода — он ничем другим не ограничен'
}

export const PromoCodes: CollectionConfig = {
  slug: 'promo-codes',
  labels: { singular: 'Промокод', plural: 'Промокоды' },
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'codeType', 'percent', 'isActive', 'isUsed', 'expiresAt', 'email', 'updatedAt'],
    group: 'Заказы',
  },
  access: {
    // Список кодов не должен быть публично перечисляемым через /api/promo-codes.
    // Проверка/применение кода идёт из route handler через Local API
    // (overrideAccess — дефолт Local API, см. комментарий в Orders.ts).
    read: staffOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (typeof data?.code === 'string') data.code = data.code.trim().toUpperCase()
        // Чужие для типа поля не должны оставаться от предыдущего выбора:
        // переключили personal → public, а email тихо остался бы в базе.
        if (data?.codeType === 'public') {
          data.email = null
          data.phone = null
          data.customerName = null
        }
        if (data?.codeType === 'personal') data.expiresAt = null
        return data
      },
    ],
  },
  fields: [
    {
      name: 'codeType',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'public',
      options: [...PROMO_CODE_TYPES],
      admin: {
        position: 'sidebar',
        description:
          'Персональный — выдаётся попапом на email, одноразовый, бессрочный. Публичный — для соцсетей, многоразовый, но со сроком действия.',
      },
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          'Хранится и сравнивается без учёта регистра (авто-UPPERCASE). У персональных генерируется бэкендом.',
      },
    },
    {
      name: 'percent',
      type: 'number',
      required: true,
      min: 1,
      max: 100,
      admin: { description: 'Скидка, % от суммы заказа без учёта подарочных товаров.' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { description: 'Снять, чтобы отключить код, не удаляя его. Действует на оба типа.' },
    },
    {
      name: 'isUsed',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        readOnly: true,
        condition: isPersonal,
        description: 'Только для персональных: ставится автоматически после оформления заявки.',
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
      index: true,
      validate: expiresRequiredForPublic,
      admin: {
        condition: isPublic,
        description: 'Обязательно для публичного кода — других ограничений у него нет.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      type: 'row',
      admin: { condition: isPersonal },
      fields: [
        {
          name: 'email',
          type: 'text',
          index: true,
          validate: requiredForPersonal('Email'),
          admin: { width: '50%', description: 'Кому выдан код. Один код на один email.' },
        },
        {
          name: 'phone',
          type: 'text',
          validate: requiredForPersonal('Телефон'),
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'customerName',
      type: 'text',
      admin: { condition: isPersonal, description: 'Имя из формы попапа.' },
    },
    {
      name: 'usedInOrder',
      type: 'relationship',
      relationTo: 'orders',
      admin: {
        readOnly: true,
        condition: isPersonal,
        description: 'Заявка, в которой код был применён — для трейсинга.',
      },
    },
  ],
}
