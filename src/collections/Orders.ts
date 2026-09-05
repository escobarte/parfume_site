import type { CollectionConfig, TextField, Validate, Where } from 'payload'
import crypto from 'node:crypto'
import { adminOnly, isStaff, staffOnly } from '@/access/roles'
import { buildOrdersCsvBulk } from '@/lib/orders/csv'
import type { Order } from '@/payload-types'

// Подписи — хардкод-русский, как весь остальной admin UI (CLAUDE.md).
// «done» расщеплён на «ready»/«issued» (готова к выдаче ≠ фактически выдана),
// «contacted» переименован в «confirmed» — 5 значений вместо 4 (фаза 4.7.1).
// Публичные подписи для страницы статуса заказа — messages/*.json::OrderStatus.
export const ORDER_STATUSES = [
  { label: 'Новая', value: 'new' },
  { label: 'Подтверждена', value: 'confirmed' },
  { label: 'Готова', value: 'ready' },
  { label: 'Выдана', value: 'issued' },
  { label: 'Отменена', value: 'cancelled' },
] as const

// Способ оформления (фаза 9.1). `noCall` — «заказать без звонка»: телефон
// всё равно обязателен, меняется только пометка менеджеру. Значения те же,
// что в src/lib/orders/schema.ts::CHECKOUT_MODES.
export const CHECKOUT_MODE_OPTIONS = [
  { label: 'Обычная заявка (перезвонить)', value: 'standard' },
  { label: 'Без звонка — НЕ ЗВОНИТЬ', value: 'noCall' },
] as const

// Способ получения (фаза 11.2, задача 5). Значения — src/lib/orders/schema.ts::DELIVERY_METHODS.
export const DELIVERY_METHOD_OPTIONS = [
  { label: 'Самовывоз', value: 'pickup' },
  { label: 'Доставка', value: 'delivery' },
] as const

// Способ оплаты (фаза 11.2, задача 6) — НЕ онлайн-оплата, отметка для
// курьера/самовывоза. Значения — src/lib/orders/schema.ts::PAYMENT_METHODS.
export const PAYMENT_METHOD_OPTIONS = [
  { label: 'Наличными', value: 'cash' },
  { label: 'Картой (курьеру)', value: 'card' },
] as const

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'Заявка', plural: 'Заявки' },
  admin: {
    useAsTitle: 'orderNumber',
    // Менеджеру нужны дата, имя, телефон, сумма и статус прямо в списке
    // (PLAN.md §6.3) — поля группы адресуются через точку.
    defaultColumns: [
      'orderNumber',
      'csvDownload',
      'createdAt',
      'customer.name',
      'customer.phone',
      'checkoutMode',
      'deliveryMethod',
      'paymentMethod',
      'promoCode',
      'total',
      'status',
    ],
    group: 'Заказы',
    listSearchableFields: ['orderNumber'],
    // Кнопка «CSV выбранных» (фаза 4.7.4) — над таблицей списка, доступна
    // всегда, но действует только когда что-то выделено (useSelection).
    components: {
      beforeListTable: ['@/components/admin/OrdersBulkCsv#OrdersBulkCsv'],
    },
  },
  access: {
    // Заявки создаёт route handler через Local API (overrideAccess), снаружи — нельзя.
    create: staffOnly,
    read: staffOnly,
    update: staffOnly,
    delete: adminOnly,
  },
  endpoints: [
    {
      // Массовый CSV нескольких заявок (фаза 4.7.4) — один файл, шапка одна,
      // позиции + итоговая строка каждой заявки друг за другом.
      path: '/bulk-csv',
      method: 'get',
      handler: async (req) => {
        if (!isStaff(req.user)) return new Response('Forbidden', { status: 403 })

        // where приходит уже структурой из useSelection().getQueryParams()
        // (?where[id][in][0]=1... или, для «выбрать все доступные», реальный
        // where-фильтр списка — не только id уже отрисованных строк).
        const where = req.query?.where
        if (!where || typeof where !== 'object') return new Response('Bad Request', { status: 400 })

        const { docs } = await req.payload.find({
          collection: 'orders',
          where: where as Where,
          depth: 0,
          limit: 0,
          pagination: false,
        })
        if (!docs.length) return new Response('Bad Request', { status: 400 })

        const csv = buildOrdersCsvBulk(docs as Order[])
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="orders.csv"',
          },
        })
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create' && !data.orderNumber) {
          const now = new Date()
          const stamp = now.toISOString().slice(2, 10).replace(/-/g, '')
          const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
          data.orderNumber = `MF-${stamp}-${rand}`
        }
        // Токен публичной страницы статуса (фаза 4.7) — генерируется уже
        // сейчас (фаза 4.6), чтобы ссылка в письме клиенту/thank-you сразу
        // указывала на итоговый адрес. Криптослучайный, не подбираем.
        if (operation === 'create' && !data.statusToken) {
          data.statusToken = crypto.randomBytes(24).toString('hex')
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'orderNumber',
      type: 'text',
      unique: true,
      index: true,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      // Фаза 4.7: публичная страница /order/<token>. Заведено уже здесь
      // (4.6) вместе с генерацией — станет доступно по ссылке, как только
      // появится сама страница.
      name: 'statusToken',
      type: 'text',
      unique: true,
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'Токен страницы статуса заказа.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [...ORDER_STATUSES],
      admin: {
        position: 'sidebar',
        // Цветная плашка в списке (фаза 4.7.3) — цвета только из tokens.css.
        components: { Cell: '@/components/admin/OrderStatusCell#OrderStatusCell' },
      },
    },
    {
      // Кнопка CSV прямо в строке списка (фаза 4.7.4), рядом с номером —
      // без сети, из уже загруженного exportCsv строки (как в карточке).
      name: 'csvDownload',
      type: 'ui',
      label: 'CSV',
      admin: {
        components: { Cell: '@/components/admin/OrderCsvCell#OrderCsvCell' },
      },
    },
    {
      // Пометка «не звонить» должна быть заметна менеджеру сразу — поэтому
      // и в сайдбаре карточки, и колонкой в списке заявок (defaultColumns).
      name: 'checkoutMode',
      label: 'Способ оформления',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      index: true,
      options: [...CHECKOUT_MODE_OPTIONS],
      admin: {
        position: 'sidebar',
        description: 'Без звонка = клиент просил не звонить. Телефон обязателен в обоих случаях.',
      },
    },
    {
      name: 'deliveryMethod',
      label: 'Способ получения',
      type: 'select',
      required: true,
      defaultValue: 'pickup',
      index: true,
      options: [...DELIVERY_METHOD_OPTIONS],
      admin: {
        position: 'sidebar',
        description: 'При доставке в customer.address обязателен адрес.',
      },
    },
    {
      name: 'paymentMethod',
      label: 'Способ оплаты',
      type: 'select',
      required: true,
      defaultValue: 'cash',
      index: true,
      options: [...PAYMENT_METHOD_OPTIONS],
      admin: {
        position: 'sidebar',
        description: 'Не онлайн-оплата — отметка для курьера/самовывоза.',
      },
    },
    {
      name: 'locale',
      type: 'select',
      options: [
        { label: 'RO', value: 'ro' },
        { label: 'RU', value: 'ru' },
        { label: 'EN', value: 'en' },
      ],
      admin: { position: 'sidebar', description: 'Локаль, с которой пришла заявка.' },
    },
    {
      name: 'source',
      type: 'text',
      defaultValue: 'site',
      admin: { position: 'sidebar', description: 'cart / one-click / site' },
    },
    {
      name: 'customer',
      type: 'group',
      label: 'Клиент',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, admin: { width: '50%' } },
            { name: 'phone', type: 'text', required: true, index: true, admin: { width: '50%' } },
          ],
        },
        {
          name: 'email',
          type: 'email',
          admin: { description: 'Необязательно — для письма-подтверждения и ссылки на статус заказа.' },
        },
        {
          name: 'address',
          label: 'Адрес',
          type: 'text',
          // Обязателен только при deliveryMethod === 'delivery' (фаза 11.2,
          // задача 5) — deliveryMethod лежит на верхнем уровне документа, не
          // в этой group, поэтому проверка через data, а не siblingData.
          validate: ((value, { data }) => {
            if (data?.deliveryMethod === 'delivery' && !String(value ?? '').trim()) {
              return 'Адрес обязателен при способе получения «Доставка».'
            }
            return true
          }) satisfies Validate<string, Partial<Order>, unknown, TextField>,
          admin: { description: 'Обязательно при доставке, для самовывоза не нужен.' },
        },
        {
          name: 'messenger',
          type: 'select',
          options: [
            { label: 'Telegram', value: 'telegram' },
            { label: 'Viber', value: 'viber' },
            { label: 'WhatsApp', value: 'whatsapp' },
            { label: 'Звонок', value: 'call' },
          ],
        },
      ],
    },
    { name: 'comment', type: 'textarea' },
    {
      name: 'items',
      type: 'array',
      label: 'Позиции',
      minRows: 1,
      admin: { description: 'Снапшот на момент заявки — не меняется вслед за каталогом.' },
      fields: [
        {
          name: 'product',
          type: 'relationship',
          relationTo: 'products',
          admin: { description: 'Ссылка на товар, если он ещё существует.' },
        },
        {
          type: 'row',
          fields: [
            { name: 'title', type: 'text', required: true, admin: { width: '40%' } },
            { name: 'brandTitle', type: 'text', admin: { width: '30%' } },
            { name: 'sku', type: 'text', required: true, admin: { width: '30%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'volume', type: 'number', admin: { width: '25%', description: 'мл' } },
            {
              name: 'price',
              type: 'number',
              required: true,
              admin: { width: '25%', description: 'MDL' },
            },
            { name: 'qty', type: 'number', required: true, min: 1, admin: { width: '25%' } },
            {
              name: 'lineTotal',
              type: 'number',
              required: true,
              admin: { width: '25%', readOnly: true },
            },
          ],
        },
      ],
    },
    {
      name: 'total',
      type: 'number',
      required: true,
      admin: { description: 'Итог заявки со скидкой, MDL.' },
    },
    {
      // Промокод (фаза 11.2, задача 7) — снапшот на момент заявки, не
      // relationship: код мог измениться/исчезнуть, а заявка должна помнить,
      // что было применено. Само поле пустое, если код не использовался.
      name: 'promoCode',
      label: 'Промокод',
      type: 'text',
      admin: { position: 'sidebar', description: 'Применённый код, если был.' },
    },
    {
      type: 'row',
      admin: { condition: (data) => Boolean(data?.promoCode) },
      fields: [
        {
          name: 'promoDiscountPercent',
          label: 'Скидка, %',
          type: 'number',
          admin: { position: 'sidebar', width: '50%' },
        },
        {
          name: 'promoDiscountAmount',
          label: 'Скидка, MDL',
          type: 'number',
          admin: {
            position: 'sidebar',
            width: '50%',
            description: 'Не считая подарочных сертификатов/Gift box — скидка на них не действует.',
          },
        },
      ],
    },
    {
      // Файл заявки в нашем формате (не 1С): менеджер скачивает его кнопкой
      // из карточки. Хранится текстом — отдельное файловое хранилище ради
      // одной таблички на заявку заводить незачем.
      name: 'exportCsv',
      type: 'textarea',
      admin: {
        readOnly: true,
        description: 'CSV заявки для Excel (UTF-8 с BOM, разделитель «;»).',
        components: {
          Field: '@/components/admin/OrderCsvField#OrderCsvField',
        },
      },
    },
  ],
}
