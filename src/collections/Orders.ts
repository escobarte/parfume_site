import type { CollectionConfig, TextField, Validate, Where } from 'payload'
import crypto from 'node:crypto'
import { adminOnly, isAdmin, isStaff, staffOnly } from '@/access/roles'
import { PRODUCT_VOLUMES } from '@/lib/catalog/volumes'
import { buildOrdersCsvBulk } from '@/lib/orders/csv'
import { logNotifyReport, resendFailedNotifications } from '@/lib/orders/notify'
import { buildOrderPdf, orderPdfFilename } from '@/lib/orders/pdf'
import { resolveOrderPromoPhone } from '@/lib/orders/promo'
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

// Статус доставки уведомления о заявке по одному каналу (2026-11-17).
// `sent`/`failed`/`skipped` — что реально произошло; пусто (ни одно из
// значений) значит «ещё не пытались» (свежесозданная заявка, before() фоновой
// отправки в after() не успел отработать). `skipped` — канал не настроен
// (нет ключа/токена/email получателя), не ошибка сети/API.
export const NOTIFY_STATUS_OPTIONS = [
  { label: 'Отправлено', value: 'sent' },
  { label: 'Не отправлено', value: 'failed' },
  { label: 'Пропущено', value: 'skipped' },
] as const

const notifyChannelField = (name: string, label: string) => ({
  name,
  type: 'group' as const,
  label,
  fields: [
    {
      name: 'status',
      type: 'select' as const,
      options: [...NOTIFY_STATUS_OPTIONS],
      admin: { readOnly: true, width: '34%' },
    },
    {
      name: 'attempts',
      type: 'number' as const,
      admin: { readOnly: true, width: '16%', description: 'Попыток.' },
    },
    {
      name: 'lastError',
      type: 'text' as const,
      admin: { readOnly: true, width: '50%', description: 'Текст последней ошибки, если была.' },
    },
  ],
})

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
      'pdfDownload',
      'createdAt',
      'customer.name',
      'customer.phone',
      'checkoutMode',
      'deliveryMethod',
      'paymentMethod',
      'promoCode',
      'total',
      'notifyStatusColumn',
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
    {
      // Печатная версия заявки. В отличие от CSV её нельзя положить в поле
      // документа (бинарник, и пересобирать его при каждом сохранении заявки
      // незачем) — файл собирается на лету по запросу.
      //
      // Доступ — ровно как у CSV: обе роли персонала, остальным отказ.
      // Анониму отвечаем 401 (не авторизован), залогиненному без роли — 403.
      path: '/:id/pdf',
      method: 'get',
      handler: async (req) => {
        if (!req.user) return new Response('Unauthorized', { status: 401 })
        if (!isStaff(req.user)) return new Response('Forbidden', { status: 403 })

        const id = req.routeParams?.id
        if (typeof id !== 'string' && typeof id !== 'number') {
          return new Response('Bad Request', { status: 400 })
        }

        const order = (await req.payload
          .findByID({ collection: 'orders', id, depth: 0 })
          .catch(() => null)) as Order | null
        if (!order) return new Response('Not Found', { status: 404 })

        const promoPhone = await resolveOrderPromoPhone(req.payload, order)
        const pdf = await buildOrderPdf(order, { promoPhone })

        return new Response(Buffer.from(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${orderPdfFilename(order)}"`,
            'Content-Length': String(pdf.length),
          },
        })
      },
    },
    {
      // Кнопка «Отправить письма заново» в карточке заказа (2026-11-17) —
      // почему теряются уведомления: см. CHANGELOG/GOTCHAS о ретраях.
      // Только admin (не staffOnly, как CSV/PDF выше) — та же граница роли,
      // что у кампаний скидок (adminCampaigns.ts): массовая/ручная пересылка
      // внешних писем клиенту менеджеру лучше не доверять.
      //
      // Повторяет ТОЛЬКО каналы, которые ещё не в статусе `sent`
      // (resendFailedNotifications в notify.ts) — уже доставленные не трогает
      // ни сетевым вызовом, ни статусом, поэтому повторное нажатие безопасно.
      path: '/:id/resend-notifications',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response('Unauthorized', { status: 401 })
        if (!isAdmin(req.user)) return new Response('Forbidden', { status: 403 })

        const id = req.routeParams?.id
        if (typeof id !== 'string' && typeof id !== 'number') {
          return new Response('Bad Request', { status: 400 })
        }

        const order = (await req.payload
          .findByID({ collection: 'orders', id, depth: 0 })
          .catch(() => null)) as Order | null
        if (!order) return new Response('Not Found', { status: 404 })

        // PDF для письма менеджеру пересобирается на лету — тот же путь, что
        // и у скачивания PDF выше, в БД файл не хранится вообще.
        let pdf: Uint8Array | null = null
        try {
          const promoPhone = await resolveOrderPromoPhone(req.payload, order)
          pdf = await buildOrderPdf(order, { promoPhone })
        } catch (error) {
          req.payload.logger.error(
            `[order ${order.orderNumber}] resend: pdf failed — ${error instanceof Error ? error.message : error}`,
          )
        }

        const { report, retried } = await resendFailedNotifications(
          req.payload,
          order,
          order.exportCsv ?? '',
          pdf,
        )
        logNotifyReport(req.payload.logger, order, report)

        return Response.json({ ok: true, retried, report })
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
      // Кнопка PDF рядом с кнопкой CSV — печатная версия той же заявки.
      // В отличие от CSV файл не лежит в строке списка, поэтому ячейка
      // ходит за ним в эндпойнт `/api/orders/:id/pdf` (см. endpoints выше).
      name: 'pdfDownload',
      type: 'ui',
      label: 'PDF',
      admin: {
        components: { Cell: '@/components/admin/OrderPdfCell#OrderPdfCell' },
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
            {
              // Снапшот на момент заявки — у подарочных позиций пусто.
              // Тот же фиксированный список из 5 значений, что у Products.
              name: 'volume',
              type: 'select',
              options: [...PRODUCT_VOLUMES],
              admin: { width: '25%' },
            },
            {
              name: 'price',
              type: 'number',
              required: true,
              admin: { width: '25%', description: 'Цена за штуку со скидкой, MDL.' },
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
        {
          // Скидка стала ПОПОЗИЦИОННОЙ (2026-09-12): у разных товаров своя
          // уценка, и промокод может выигрывать у одних позиций и проигрывать
          // другим. Одним числом на заявку это больше не описывается, поэтому
          // снапшот скидки хранится в самой позиции.
          type: 'row',
          fields: [
            {
              name: 'basePrice',
              type: 'number',
              admin: {
                width: '33%',
                readOnly: true,
                description: 'Цена до скидки (зачёркнутая), MDL. Пусто — скидки не было.',
              },
            },
            {
              name: 'discountPercent',
              type: 'number',
              admin: { width: '33%', readOnly: true, description: 'Применённая скидка, %.' },
            },
            {
              name: 'discountSource',
              type: 'select',
              options: [
                { label: 'Скидка товара', value: 'product' },
                { label: 'Промокод', value: 'promo' },
              ],
              admin: {
                width: '33%',
                readOnly: true,
                description: 'Что победило на этой позиции — своя уценка или промокод.',
              },
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
      // Статус доставки уведомлений (2026-11-17) — письмо менеджеру, письмо
      // клиенту, Telegram. Пишется только сервером (notify.ts::recordNotifyStatus,
      // вызывается из after() в order-request/route.ts и из эндпойнта кнопки
      // «Отправить письма заново» ниже).
      //
      // `admin.hidden: true` — чисто контейнер данных, сам по себе нигде не
      // рендерится: `group` в этой версии Payload поддерживает кастомный
      // `admin.components` только для `Label`, НЕ для всего поля целиком
      // (проверено вживую — с `Field`/`Cell` на самой группе карточка молча
      // ничего не рисовала, хотя и TS, и схема принимали эти ключи без
      // единой ошибки). Отображение — двумя отдельными `ui`-полями ниже, тем
      // же приёмом, что уже работает у `exportPdf`/`csvDownload`.
      name: 'notifyStatus',
      type: 'group',
      label: 'Статус уведомлений',
      admin: { hidden: true },
      fields: [
        notifyChannelField('emailManager', 'Письмо менеджеру'),
        notifyChannelField('emailCustomer', 'Письмо клиенту'),
        notifyChannelField('telegram', 'Telegram'),
      ],
    },
    {
      // Карточка заказа: три плашки статуса + кнопка «Отправить письма
      // заново» (только admin) — `ui`-поле читает значения скрытой группы
      // `notifyStatus` через `useFormFields` (OrderNotifyStatusField.tsx).
      name: 'notifyStatusView',
      type: 'ui',
      label: 'Статус уведомлений',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/OrderNotifyStatusField#OrderNotifyStatusField' },
      },
    },
    {
      // Та же тройка плашек компактно — колонкой в списке заявок. `ui`-поле
      // в списке получает `rowData` целого документа (как у `csvDownload`
      // выше), поэтому читает `rowData.notifyStatus` напрямую, без формы.
      name: 'notifyStatusColumn',
      type: 'ui',
      label: 'Уведомления',
      admin: {
        components: { Cell: '@/components/admin/OrderNotifyStatusCell#OrderNotifyStatusCell' },
      },
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
    {
      // Печатная версия заявки — собирается эндпойнтом по запросу, в
      // документе не хранится, поэтому это `ui`-поле, а не textarea с
      // содержимым (как exportCsv выше). Имя отличается от колонки списка
      // (`pdfDownload`): имена полей в коллекции уникальны.
      name: 'exportPdf',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/admin/OrderPdfField#OrderPdfField',
        },
      },
    },
  ],
}
