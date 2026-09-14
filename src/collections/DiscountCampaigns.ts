import type { CollectionConfig, FieldAccess } from 'payload'
import { adminOnly, isAdmin, staffOnly } from '@/access/roles'

/**
 * Кампании скидок (2026-09-12, вариант C дизайн-обсуждения).
 *
 * Кампания — это ручная массовая уценка: отобрали товары гибким правилом,
 * нажали «Запустить» — у всех активных вариантов проставилась новая цена;
 * нажали «Остановить» — всё вернулось как было. Планировщика НЕТ: даты в
 * карточке — заметка владельцу, они ничего не триггерят.
 *
 * **Схема `Products.variants` не трогается вообще.** Кампания меняет
 * `price`/`oldPrice` вариантов ровно тем же способом, что и ручная правка
 * в `/admin`, а источник правды для отката — журнал `journal[]` в самой
 * кампании. Отсюда же и сверка перед откатом: если цену поменяли извне
 * (руками или CSV-импортом), пока кампания шла, вариант не трогается и
 * попадает в `conflicts[]` — см. `src/lib/campaigns/run.ts`.
 *
 * Почему журнал, а не «пересчитать обратно по проценту»: процент округляется
 * до целого MDL, обратный пересчёт исходную цену не возвращает (та же
 * ловушка, что описана в `src/lib/pricing.ts`), и товар после пары кампаний
 * уезжал бы в цене сам по себе.
 */

export const CAMPAIGN_STATUSES = [
  { label: 'Черновик', value: 'draft' },
  { label: 'Идёт', value: 'active' },
  { label: 'Завершена', value: 'finished' },
] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]['value']

export const CONFLICT_REASONS = [
  { label: 'Цену поменяли извне', value: 'price_changed' },
  { label: 'Вариант исчез', value: 'variant_missing' },
  { label: 'Откат заблокирован правилом «скидка на всех вариантах сразу»', value: 'blocked_by_consistency' },
] as const

export type ConflictReason = (typeof CONFLICT_REASONS)[number]['value']

/**
 * Настройки кампании правятся только в черновике. После старта журнал уже
 * записан, и смена процента или отбора сделала бы откат невозможным:
 * журнал описывал бы одни товары, а кампания — другие.
 *
 * Именно `access.update`, а не `admin.readOnly`: последний — статический
 * флаг, а запрет зависит от статуса конкретной записи. Поле, закрытое
 * доступом, Payload и в админке показывает нередактируемым, и из PATCH
 * отбрасывает — то есть правило одно на UI и на API.
 */
const draftOnlyField: FieldAccess = ({ doc, req }) => {
  if (!isAdmin(req.user)) return false
  // `doc` нет при создании — это всегда черновик.
  return (doc?.status ?? 'draft') === 'draft'
}

export const DiscountCampaigns: CollectionConfig = {
  slug: 'discount-campaigns',
  labels: { singular: 'Кампания скидок', plural: 'Кампании скидок' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'percent', 'status', 'affectedVariantsCount', 'updatedAt'],
    group: 'Каталог',
    description:
      'Массовая уценка по отбору. Даты в карточке — заметка для себя, автозапуска и автоотката нет: кампания стартует и останавливается только кнопками.',
  },
  access: {
    // Менеджеру — видеть, что идёт (цены в заказах объясняются кампанией),
    // но не запускать: это массовая правка каталога, товары у него read-only.
    read: staffOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          admin: { width: '60%', description: 'Например: «Чёрная пятница 2026».' },
        },
        {
          name: 'percent',
          type: 'number',
          required: true,
          min: 1,
          max: 99,
          access: { update: draftOnlyField },
          admin: {
            width: '40%',
            description: 'Скидка кампании, % от ТЕКУЩЕЙ цены варианта.',
          },
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [...CAMPAIGN_STATUSES],
      // Статус двигают только кнопки «Запустить»/«Остановить»: руками
      // выставленный `active` означал бы «кампания идёт» при пустом журнале,
      // и остановка не откатила бы ничего.
      access: { update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Меняется только кнопками «Запустить» / «Остановить».',
      },
    },
    {
      name: 'campaignActions',
      type: 'ui',
      admin: {
        components: { Field: '@/components/admin/CampaignActions#CampaignActions' },
      },
    },
    {
      name: 'selectionRule',
      type: 'group',
      label: 'Отбор товаров',
      admin: {
        description:
          'Объединение трёх списков: товар попадает в кампанию, если подходит ХОТЯ БЫ ПОД ОДИН критерий. Кампания применяется ко всем активным вариантам отобранного товара сразу.',
      },
      fields: [
        {
          name: 'brands',
          type: 'relationship',
          relationTo: 'brands',
          hasMany: true,
          access: { update: draftOnlyField },
          admin: { description: 'Все товары этих брендов.' },
        },
        {
          name: 'categories',
          type: 'relationship',
          relationTo: 'categories',
          hasMany: true,
          access: { update: draftOnlyField },
          admin: { description: 'Все товары этих категорий.' },
        },
        {
          name: 'manualProducts',
          type: 'relationship',
          relationTo: 'products',
          hasMany: true,
          access: { update: draftOnlyField },
          admin: { description: 'Отдельные товары, добавленные вручную.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          // НЕ используются ни для какого автозапуска — планировщика в системе
          // нет вовсе. Это заметка «я планировала закончить примерно тогда».
          name: 'startDateNote',
          type: 'date',
          label: 'Планируемое начало (заметка)',
          admin: {
            width: '50%',
            description: 'Ни на что не влияет — кампания стартует только кнопкой.',
          },
        },
        {
          name: 'endDateNote',
          type: 'date',
          label: 'Планируемое окончание (заметка)',
          admin: {
            width: '50%',
            description: 'Ни на что не влияет — кампания останавливается только кнопкой.',
          },
        },
      ],
    },
    {
      name: 'affectedVariantsCount',
      type: 'number',
      label: 'Затронуто вариантов',
      access: { update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Заполняется при старте — длина журнала.',
      },
    },
    {
      name: 'affectedProductsCount',
      type: 'number',
      label: 'Затронуто товаров',
      access: { update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'startedAt',
      type: 'date',
      access: { update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'finishedAt',
      type: 'date',
      access: { update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'journal',
      type: 'array',
      label: 'Журнал применения',
      labels: { singular: 'Строка журнала', plural: 'Журнал' },
      access: { update: () => false },
      admin: {
        readOnly: true,
        initCollapsed: true,
        description:
          'Что именно и с какими ценами изменила кампания при старте. Источник правды для отката — руками не редактируется.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'sku', type: 'text', required: true, admin: { width: '25%' } },
            {
              // Нужен, чтобы откат не искал вариант перебором всего каталога
              // по sku. Сами цены всё равно берутся из строк ниже.
              name: 'product',
              type: 'relationship',
              relationTo: 'products',
              admin: { width: '25%' },
            },
            {
              name: 'priceBefore',
              type: 'number',
              required: true,
              admin: { width: '25%', description: 'Цена до старта, MDL.' },
            },
            {
              name: 'oldPriceBefore',
              type: 'number',
              admin: { width: '25%', description: 'Зачёркнутая до старта. Пусто — её не было.' },
            },
          ],
        },
        {
          name: 'priceSet',
          type: 'number',
          required: true,
          admin: { description: 'Цена, выставленная кампанией, MDL.' },
        },
      ],
    },
    {
      name: 'conflicts',
      type: 'array',
      label: 'Конфликты при остановке',
      labels: { singular: 'Конфликт', plural: 'Конфликты' },
      access: { update: () => false },
      admin: {
        readOnly: true,
        initCollapsed: false,
        description:
          'Варианты, которые откатить не удалось: цену поменяли извне, пока кампания шла. Кампания их НЕ трогала — решайте вручную.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'sku', type: 'text', required: true, admin: { width: '25%' } },
            {
              name: 'reason',
              type: 'select',
              required: true,
              options: [...CONFLICT_REASONS],
              admin: { width: '25%' },
            },
            {
              name: 'priceNow',
              type: 'number',
              admin: { width: '25%', description: 'Что стоит сейчас, MDL.' },
            },
            {
              name: 'priceSet',
              type: 'number',
              admin: { width: '25%', description: 'Что выставила кампания, MDL.' },
            },
          ],
        },
        {
          name: 'priceBefore',
          type: 'number',
          admin: { description: 'Цена до кампании — то, к чему откат вернул бы вариант.' },
        },
      ],
    },
  ],
}
