import type { CollectionConfig } from 'payload'
import { adminOnly, staffOnly } from '@/access/roles'

export const ORDER_STATUSES = [
  { label: 'Новая', value: 'new' },
  { label: 'Связались', value: 'contacted' },
  { label: 'Выполнена', value: 'done' },
  { label: 'Отменена', value: 'cancelled' },
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
      'createdAt',
      'customer.name',
      'customer.phone',
      'total',
      'status',
    ],
    group: 'Заказы',
    listSearchableFields: ['orderNumber'],
  },
  access: {
    // Заявки создаёт route handler через Local API (overrideAccess), снаружи — нельзя.
    create: staffOnly,
    read: staffOnly,
    update: staffOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create' && !data.orderNumber) {
          const now = new Date()
          const stamp = now.toISOString().slice(2, 10).replace(/-/g, '')
          const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
          data.orderNumber = `MF-${stamp}-${rand}`
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
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [...ORDER_STATUSES],
      admin: { position: 'sidebar' },
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
      admin: { description: 'Итог заявки, MDL.' },
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
