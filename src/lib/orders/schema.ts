import { z } from 'zod'

/**
 * Молдавский номер: +373 и восемь цифр. На вход принимаем как есть — с
 * пробелами и скобками, — но нормализуем до +373XXXXXXXX.
 */
export const PHONE_PATTERN = /^\+373\d{8}$/

export const normalizePhone = (value: string) => {
  const digits = value.replace(/[^\d]/g, '')
  const local = digits.startsWith('373') ? digits.slice(3) : digits
  return `+373${local}`
}

export const MESSENGERS = ['telegram', 'viber', 'whatsapp', 'call'] as const

export const orderItemSchema = z.object({
  productId: z.union([z.string(), z.number()]),
  slug: z.string().min(1),
  title: z.string().min(1),
  brandTitle: z.string().default(''),
  sku: z.string().min(1),
  volume: z.number().positive(),
  price: z.number().nonnegative(),
  qty: z.number().int().positive().max(99),
})

export const orderRequestSchema = z.object({
  name: z.string().trim().min(2, 'name'),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((value) => PHONE_PATTERN.test(value), 'phone'),
  messenger: z.enum(MESSENGERS).optional(),
  comment: z.string().trim().max(2000).optional(),
  locale: z.enum(['ro', 'ru', 'en']).default('ro'),
  source: z.string().default('cart'),
  items: z.array(orderItemSchema).min(1, 'items'),
  /** Honeypot: поле спрятано от человека, бот его заполняет. */
  company: z.string().max(0, 'honeypot').optional(),
})

export type OrderRequest = z.infer<typeof orderRequestSchema>
