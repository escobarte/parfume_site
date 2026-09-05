import type { CollectionConfig } from 'payload'
import { adminOnly, staffOnly } from '@/access/roles'

/**
 * Промокоды (фаза 11.2, задача 7) — скидка только процентная (без фикс.
 * суммы), код глобально одноразовый: после первого успешного применения в
 * ОФОРМЛЕННОЙ заявке недействителен для всех, не «раз на клиента» (клиент
 * подтвердил это в штабе). `isUsed` выставляется САМИМ роутом заявки
 * (`src/app/(frontend)/api/order-request/route.ts`) только после успешного
 * создания заказа — не в момент проверки кода (`/api/promo-code-check`),
 * иначе код «сгорал» бы даже при незавершённом оформлении.
 *
 * Регистронезависимость (assumption, легко поменять) — не ILIKE на каждый
 * запрос, а нормализация: код всегда хранится и сравнивается в верхнем
 * регистре (`beforeChange` ниже + `normalizePromoCode()` в src/lib/orders/promo.ts).
 */
export const PromoCodes: CollectionConfig = {
  slug: 'promo-codes',
  labels: { singular: 'Промокод', plural: 'Промокоды' },
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'percent', 'isActive', 'isUsed', 'expiresAt', 'usedInOrder', 'updatedAt'],
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
        return data
      },
    ],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Хранится и сравнивается без учёта регистра (авто-UPPERCASE при сохранении).' },
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
      admin: { description: 'Снять, чтобы отключить код, не удаляя его.' },
    },
    {
      name: 'isUsed',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        readOnly: true,
        description: 'Выставляется автоматически после успешного оформления заявки — руками не трогать.',
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
      admin: {
        description: 'Необязательно — срок клиент не оговаривал, логика проверки готова.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'usedInOrder',
      type: 'relationship',
      relationTo: 'orders',
      admin: { readOnly: true, description: 'Заявка, в которой код был применён — для трейсинга.' },
    },
  ],
}
