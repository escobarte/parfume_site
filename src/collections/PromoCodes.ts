import type {
  CollectionConfig,
  TextFieldValidation,
  DateFieldValidation,
  NumberFieldValidation,
  SelectFieldValidation,
} from 'payload'
import { adminOnly, staffOnly } from '@/access/roles'
import { PRODUCT_VOLUMES } from '@/lib/catalog/volumes'
import { PROMO_APPLIES_TO_VALUES, type PromoAppliesTo } from '@/lib/orders/promoRule'

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

const PROMO_APPLIES_TO_LABELS: Record<PromoAppliesTo, string> = {
  all: 'Любые товары',
  decants: 'Только отливанты (3/5/10 мл)',
  volumes: 'Выбранные объёмы',
}

/** Целое ≥1 — пусто (не 0) значит «условия по количеству нет». */
const minQuantityValidate: NumberFieldValidation = (value) => {
  if (value === undefined || value === null) return true
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? true
    : 'Минимум штук: целое число не меньше 1 (пусто — условия нет).'
}

const volumesRequiredForVolumesMode: SelectFieldValidation = (value, { data }) => {
  if ((data as { appliesTo?: string } | undefined)?.appliesTo !== 'volumes') return true
  const list = Array.isArray(value) ? value : []
  return list.length > 0 ? true : 'Объёмы: обязательно для режима «Выбранные объёмы».'
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
        // Выбрали 'all'/'decants' — список объёмов от прежнего 'volumes' не
        // должен залипать в базе (условие по нему больше не проверяется).
        if (data?.appliesTo !== 'volumes') data.volumes = []
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
      // Условия применения (акция «от 3 отливантов −20%», 2026-10-23) — чтобы
      // такие акции заводились без разработчика. Все поля необязательные по
      // смыслу: у старых кодов `appliesTo` по умолчанию 'all', `minQuantity`
      // пуст — ведут себя ровно как раньше. Общая логика «подходит ли
      // позиция» / «выполнено ли условие» — src/lib/orders/promoRule.ts,
      // используется и здесь (косвенно, через тот же модуль), и клиентом,
      // и сервером при оформлении заявки.
      name: 'minQuantity',
      label: 'Минимум штук для скидки',
      type: 'number',
      validate: minQuantityValidate,
      admin: {
        description:
          'Сколько подходящих позиций должно быть в корзине, чтобы скидка сработала. Пусто — условия нет.',
      },
    },
    {
      name: 'appliesTo',
      label: 'К каким позициям применяется',
      type: 'select',
      defaultValue: 'all',
      options: PROMO_APPLIES_TO_VALUES.map((value) => ({ label: PROMO_APPLIES_TO_LABELS[value], value })),
      admin: {
        description:
          'Какие позиции считаются «подходящими» для условия и получают скидку. «Любые товары» — как раньше.',
      },
    },
    {
      name: 'volumes',
      label: 'Объёмы',
      type: 'select',
      hasMany: true,
      options: [...PRODUCT_VOLUMES],
      validate: volumesRequiredForVolumesMode,
      admin: {
        condition: (data) => data?.appliesTo === 'volumes',
        description: 'Обязательно для режима «Выбранные объёмы» — сами значения объёма.',
      },
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
