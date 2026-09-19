import { z } from 'zod'
import { PRODUCT_VOLUMES } from '@/lib/catalog/volumes'
import { normalizePhone, PHONE_PATTERN } from './phone'

/*
 * Разбор и канон телефона переехали в `src/lib/orders/phone.ts` (2026-09-19):
 * те же правила нужны и полю ввода в браузере, и серверу, а тащить в
 * клиентский компонент всю эту схему с zod незачем. Реэкспорт сохраняет
 * существующие импорты `from '@/lib/orders/schema'`.
 */
export { normalizePhone, PHONE_PATTERN } from './phone'

export const MESSENGERS = ['telegram', 'viber', 'whatsapp', 'call'] as const

/**
 * Способ оформления заявки (фаза 9.1):
 * - `standard` — обычная заявка, менеджер перезванивает (дефолт);
 * - `noCall`  — «заказать без звонка»: менеджеру ставится пометка «не звонить».
 *
 * На валидацию телефона НЕ влияет: телефон обязателен в обоих случаях —
 * это единственный канал связи (см. комментарий к email ниже).
 */
export const CHECKOUT_MODES = ['standard', 'noCall'] as const
export type CheckoutMode = (typeof CHECKOUT_MODES)[number]

/**
 * Способ получения (фаза 11.2, задача 5). Дефолт `pickup` — не требует
 * адреса. `delivery` требует адрес — закрывает решение владельца из
 * STATE.md («Ждёт владельца», п.10): адрес обязателен ТОЛЬКО при доставке,
 * не всегда.
 */
export const DELIVERY_METHODS = ['pickup', 'delivery'] as const
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]

/**
 * Способ оплаты (фаза 11.2, задача 6) — НЕ онлайн-оплата, просто отметка в
 * заявке: клиент платит наличными или картой курьеру/на месте при
 * самовывозе. Никакого эквайринга не подключается.
 */
export const PAYMENT_METHODS = ['cash', 'card'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

// Товар (духи) или подарочный товар (сертификат/Gift box, фаза 11.1, задача
// 2) — говорит серверу, какую коллекцию резолвить заново в buildItems()
// (route.ts). Дефолт 'product' — старые клиенты без этого поля не ломаются.
export const ORDER_ITEM_KINDS = ['product', 'gift'] as const

export const orderItemSchema = z.object({
  kind: z.enum(ORDER_ITEM_KINDS).default('product'),
  productId: z.union([z.string(), z.number()]),
  slug: z.string().min(1),
  title: z.string().min(1),
  brandTitle: z.string().default(''),
  sku: z.string().min(1),
  // Объём — только у товаров-духов, у подарочных товаров нет. Фиксированный
  // список из 5 значений (новая модель объёма) — авторитетно берётся с
  // сервера (buildItems() в route.ts), не от клиента, но схема всё равно
  // проверяет форму на случай прямого вызова API.
  volume: z.enum(PRODUCT_VOLUMES).optional(),
  price: z.number().nonnegative(),
  qty: z.number().int().positive().max(99),
})

export const orderRequestSchema = z
  .object({
    name: z.string().trim().min(2, 'name'),
    phone: z
      .string()
      .transform(normalizePhone)
      .refine((value) => PHONE_PATTERN.test(value), 'phone'),
    // Необязателен — телефон единственный обязательный канал (Молдова: Viber/
    // WhatsApp/звонок работают без email). Если заполнен — обязан быть валидным.
    email: z.union([z.literal(''), z.string().trim().email('email')]).optional(),
    messenger: z.enum(MESSENGERS).optional(),
    checkoutMode: z.enum(CHECKOUT_MODES).default('standard'),
    deliveryMethod: z.enum(DELIVERY_METHODS).default('pickup'),
    paymentMethod: z.enum(PAYMENT_METHODS).default('cash'),
    // Обязателен только при deliveryMethod === 'delivery' — см. .refine ниже.
    // Телефон при этом остаётся обязательным всегда (правило не менялось).
    address: z.string().trim().max(500).optional(),
    comment: z.string().trim().max(2000).optional(),
    locale: z.enum(['ro', 'ru', 'en']).default('ro'),
    source: z.string().default('cart'),
    items: z.array(orderItemSchema).min(1, 'items'),
    // Промокод (фаза 11.2, задача 7) — необязателен, авторитетно
    // переоценивается на сервере (resolvePromoCode), клиентский percent не
    // принимается вообще, только сам код.
    promoCode: z.string().trim().max(50).optional(),
    /**
     * Телефон, которым персональный код подтвердили в корзине. НЕ дублирует
     * `phone` выше: тот — телефон доставки, и он может отличаться (код выдан
     * на личный номер, заказ оформляют на номер получателя). Сервер сверяет
     * это значение с БД, поэтому подставить чужой номер бесполезно.
     */
    promoPhone: z.string().trim().max(40).optional(),
    /** Honeypot: поле спрятано от человека, бот его заполняет. */
    company: z.string().max(0, 'honeypot').optional(),
  })
  .refine((data) => data.deliveryMethod !== 'delivery' || Boolean(data.address?.trim()), {
    message: 'address',
    path: ['address'],
  })

export type OrderRequest = z.infer<typeof orderRequestSchema>

/**
 * Запасной путь страницы статуса заказа (фаза 4.7.2): номер И телефон вместе
 * ОБЯЗАТЕЛЬНЫ — оба поля required на уровне схемы, без .optional() ни на
 * одном. Поиск по одному лишь номеру запрещён не только в UI, но и здесь:
 * без телефона safeParse() не пройдёт, эндпоинт не долетит до payload.find.
 */
export const orderLookupSchema = z.object({
  orderNumber: z.string().trim().min(1, 'orderNumber'),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((value) => PHONE_PATTERN.test(value), 'phone'),
})

export type OrderLookup = z.infer<typeof orderLookupSchema>
