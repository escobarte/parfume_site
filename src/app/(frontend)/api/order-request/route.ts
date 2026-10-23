import { after, NextResponse } from 'next/server'
import type { GiftItem, Order, Product } from '@/payload-types'
import { buildOrderCsv } from '@/lib/orders/csv'
import { logNotifyReport, notifyOrder } from '@/lib/orders/notify'
import { writeOrderCsvExport } from '@/lib/orders/orderExport'
import { buildOrderPdf } from '@/lib/orders/pdf'
import { claimPromoCode, resolveOrderPromoPhone, resolvePromoCode } from '@/lib/orders/promo'
import { lineMatchesPromoRule, promoConditionMet, type PromoRule } from '@/lib/orders/promoRule'
import { checkRateLimit, clientIp } from '@/lib/orders/rateLimit'
import { orderRequestSchema, type OrderRequest } from '@/lib/orders/schema'
import { getPayloadClient } from '@/lib/payload'
import { priceLine } from '@/lib/pricing'

/**
 * Приём заявки. Путь намеренно НЕ `/api/orders`: там живёт REST-эндпоинт
 * коллекции Payload, и статический роут Next перекрыл бы его — админка
 * перестала бы читать заявки (проверено: GET /api/orders отдавал 405).
 *
 * Логика: валидация → снапшот позиций по данным БД → заказ в Payload →
 * CSV → печатный PDF → уведомления. Заявка считается принятой, как только она в базе;
 * проблемы с Telegram или почтой в ответ клиенту не протекают.
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limit' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  let payloadBody: unknown
  try {
    payloadBody = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 })
  }

  const parsed = orderRequestSchema.safeParse(payloadBody)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'form')
    // Ботам, попавшимся на honeypot, отвечаем как обычной ошибкой формы.
    return NextResponse.json({ ok: false, error: 'validation', fields }, { status: 400 })
  }

  const data: OrderRequest = parsed.data
  const payload = await getPayloadClient()

  // Цены и названия берём из БД, а не из тела запроса: клиент может прислать
  // что угодно, а в заявке должен лежать честный снапшот каталога.
  // Промокод резолвится ДО сборки позиций: его процент (и правило условия)
  // нужны, чтобы посчитать каждую позицию по правилу «выигрывает больший
  // процент» — но сначала позиции нужно резолвнуть из БД (resolveOrderLines
  // ниже), иначе объём для проверки условия взялся бы с клиента.
  let promo: Awaited<ReturnType<typeof resolvePromoCode>> | null = null
  if (data.promoCode) {
    promo = await resolvePromoCode(payload, data.promoCode, data.promoPhone)
    if (!promo.ok) {
      return NextResponse.json(
        { ok: false, error: 'promo_invalid', promoError: promo.error },
        { status: 400 },
      )
    }
  }

  const resolvedLines = await resolveOrderLines(payload, data)
  if (!resolvedLines.length) {
    return NextResponse.json({ ok: false, error: 'items_unavailable' }, { status: 400 })
  }

  // Авторитетная проверка условия — по позициям, пересчитанным из БД (объём
  // варианта, не то, что прислал клиент). Условие не выполнено → заявка не
  // создаётся, корзина клиента не очищается (ответ `promo_invalid` до этого
  // уже обрабатывается тем же путём на фронте — см. OrderForm.tsx).
  const rule: PromoRule | null = promo?.ok ? promo : null
  if (
    rule &&
    !promoConditionMet(
      resolvedLines.map((line) => ({
        kind: line.kind,
        volume: line.kind === 'product' ? line.variant.volume : null,
        qty: line.qty,
      })),
      rule,
    )
  ) {
    return NextResponse.json(
      { ok: false, error: 'promo_invalid', promoError: 'min_quantity' },
      { status: 400 },
    )
  }

  const { items, promoSaving, promoWonAnywhere } = priceOrderLines(
    resolvedLines,
    promo?.ok ? promo.percent : 0,
    rule,
  )

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)

  // `subtotal` уже со всеми скидками: каждая позиция посчитана по правилу
  // «выигрывает больший процент» внутри priceOrderLines. Отдельного вычитания
  // на уровне заказа больше нет — до 2026-09-12 здесь был один агрегат на всю
  // заявку, теперь скидка попозиционная.
  const total = subtotal

  const order = (await payload.create({
    collection: 'orders',
    data: {
      status: 'new',
      locale: data.locale,
      source: data.source,
      checkoutMode: data.checkoutMode,
      deliveryMethod: data.deliveryMethod,
      paymentMethod: data.paymentMethod,
      customer: {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        address: data.address || undefined,
        messenger: data.messenger,
      },
      comment: data.comment,
      items,
      total,
      // `promoDiscountPercent` — НОМИНАЛ кода, а не эффективная скидка:
      // эффективная теперь у каждой позиции своя. `promoDiscountAmount` —
      // фактическая выгода именно от кода (сколько клиент заплатил бы без
      // него минус сколько платит), по позициям, где код выиграл.
      ...(promo?.ok
        ? { promoCode: promo.code, promoDiscountPercent: promo.percent, promoDiscountAmount: promoSaving }
        : {}),
    },
  })) as Order

  // Код помечается использованным ТОЛЬКО после того, как заказ реально создан
  // (не в момент проверки) — см. комментарий в src/lib/orders/promo.ts.
  // И только персональный: публичный код многоразовый, пометка убила бы его
  // после первой же заявки (типы кодов — 2026-09-11).
  // Одноразовый код сгорает ТОЛЬКО если реально дал выгоду хотя бы на одной
  // позиции (решение владельца 2026-09-12). Пограничный случай «в корзине
  // часть позиций выиграл код, часть — своя скидка» трактуется в пользу
  // клиента-и-здравого смысла: выгода была, код списывается — иначе один
  // код можно было бы бесконечно применять, добирая в каждый заказ по одному
  // сильно уценённому товару. Если же код не выиграл НИГДЕ, он остаётся
  // неиспользованным и применим позже.
  if (promo?.ok && promo.codeType === 'personal' && promoWonAnywhere) {
    const claimed = await claimPromoCode(payload, promo.id, order.id)
    if (!claimed) {
      // Крайне маловероятная гонка (два одновременных оформления одним кодом)
      // — заказ уже создан со скидкой, откатывать его ради этого не стоит,
      // просто фиксируем в логе (см. GOTCHAS.md).
      payload.logger.warn(`Промокод ${promo.code} не удалось пометить использованным (гонка?)`)
    }
  }

  const csv = buildOrderCsv(order)
  await payload.update({
    collection: 'orders',
    id: order.id,
    data: { exportCsv: csv },
  })

  // Файл для 1С (SFTP забирает их специалист, сайт только пишет) — после
  // ответа клиенту, как и остальная фоновая работа (GOTCHAS.md: `after()`,
  // не висячий промис). Собственный try/catch внутри `writeOrderCsvExport`
  // не даёт сбою записи на диск повлиять на заявку: она уже в базе. В
  // интеграционных тестах, зовущих POST() напрямую (вне request scope
  // Next), `after()` нужно мокать — см. docs/GOTCHAS.md и
  // tests/int/order-promo-burn.int.spec.ts.
  after(() => writeOrderCsvExport(order, csv))

  // Печатная версия заявки — вторым вложением к письму менеджеру. Падение
  // генерации (нет шрифтов, сломанный документ) не должно ронять ни заявку,
  // ни письмо: логируем и отправляем без PDF.
  let pdf: Uint8Array | null = null
  try {
    const promoPhone = await resolveOrderPromoPhone(payload, order)
    pdf = await buildOrderPdf(order, { promoPhone })
  } catch (error) {
    payload.logger.error(
      `[order ${order.orderNumber}] pdf failed: ${error instanceof Error ? error.message : error}`,
    )
  }

  const report = await notifyOrder(order, csv, pdf)
  logNotifyReport(payload.logger, order, report)

  return NextResponse.json({
    ok: true,
    orderNumber: order.orderNumber,
    dryRun: report.dryRun,
  })
}

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>

type ResolvedGiftLine = {
  kind: 'gift'
  qty: number
  giftItem: GiftItem
  variant: NonNullable<GiftItem['variants']>[number]
}

type ResolvedProductLine = {
  kind: 'product'
  qty: number
  product: Product
  variant: NonNullable<Product['variants']>[number]
}

type ResolvedLine = ResolvedGiftLine | ResolvedProductLine

/**
 * Резолвит каждую позицию заявки в БД — товар/подарочный товар, его вариант,
 * объём. Раньше это было частью `buildItems` и шло вперемешку с расчётом
 * цены; разделено (2026-10-23), потому что условие промокода (минимум штук,
 * фильтр по объёму) нужно проверить ПОСЛЕ резолва (объём берётся из БД,
 * не от клиента), но ДО того, как считать скидку — иначе решение «применять
 * ли код вообще» принималось бы по неполной картине.
 */
async function resolveOrderLines(payload: PayloadClient, data: OrderRequest): Promise<ResolvedLine[]> {
  const lines: ResolvedLine[] = []

  for (const requested of data.items) {
    if (requested.kind === 'gift') {
      // Подарочный товар (фаза 11.1, задача 2) — та же переоценка по слагу
      // и SKU, что у обычного товара ниже, только другая коллекция и без
      // ml-объёма. `product` (relationship) намеренно не проставляется:
      // связь необязательна (снапшот остаётся честным и без неё), заводить
      // полиморфную `relationTo` ради одного поля админ-ссылки — лишнее.
      const { docs } = await payload.find({
        collection: 'gift-items',
        locale: data.locale,
        depth: 0,
        limit: 1,
        where: { slug: { equals: requested.slug } },
      })

      const giftItem = docs[0]
      const variant = giftItem?.variants?.find((candidate) => candidate.sku === requested.sku)
      if (!giftItem || giftItem.isActive === false || !variant || variant.isActive === false) {
        continue
      }
      lines.push({ kind: 'gift', qty: requested.qty, giftItem, variant })
      continue
    }

    const { docs } = await payload.find({
      collection: 'products',
      locale: data.locale,
      depth: 1,
      limit: 1,
      where: { slug: { equals: requested.slug } },
    })

    const product = docs[0]
    const variant = product?.variants?.find((candidate) => candidate.sku === requested.sku)
    // Товар пропал или вариант отключили, пока корзина лежала в localStorage.
    if (!product || !variant || variant.isActive === false) continue

    lines.push({ kind: 'product', qty: requested.qty, product, variant })
  }

  return lines
}

/**
 * Считает позиции заявки по уже резолвленным из БД строкам.
 *
 * С 2026-09-12 здесь же применяется правило совмещения скидок: на КАЖДОЙ
 * позиции выигрывает больший процент — собственная уценка товара или
 * промокод (`priceLine`). Раньше промокод вычитался одним агрегатом из всей
 * суммы, теперь у каждой позиции свой исход, и `lineTotal` уже со скидкой.
 *
 * С 2026-10-23 промокод с условием по объёму/типу (`rule`) побеждает ТОЛЬКО
 * на подходящих позициях (`lineMatchesPromoRule`) — на неподходящих (нет
 * объёма или вне фильтра кода) код не участвует вовсе, они идут по своей
 * цене/скидке товара, как если бы кода не было.
 *
 * Возвращает заодно две величины, которые нужны вызывающему: фактическую
 * выгоду от кода (`promoSaving`) и признак «код выиграл хоть где-то»
 * (`promoWonAnywhere`) — от второго зависит, сгорает ли одноразовый код.
 */
function priceOrderLines(lines: ResolvedLine[], promoPercent: number, rule: PromoRule | null) {
  const items: NonNullable<Order['items']> = []
  let promoSaving = 0
  let promoWonAnywhere = false

  for (const line of lines) {
    if (line.kind === 'gift') {
      // Промокод на подарочные сертификаты/Gift box не действует
      // (фаза 11.2, задача 7) — правило к ним просто не применяется.
      items.push({
        title: line.giftItem.title,
        brandTitle: '',
        sku: line.variant.sku,
        price: line.variant.amount,
        qty: line.qty,
        lineTotal: line.variant.amount * line.qty,
      })
      continue
    }

    const { product, variant, qty } = line
    const brand = typeof product.brand === 'object' && product.brand ? product.brand.title : ''
    const eligible = rule ? lineMatchesPromoRule({ kind: 'product', volume: variant.volume, qty }, rule) : true

    const pricing = priceLine(variant.price, variant.oldPrice, eligible ? promoPercent : 0)
    if (pricing.source === 'promo') {
      promoWonAnywhere = true
      // Выгода именно от кода: разница с тем, что клиент заплатил бы без него.
      promoSaving += (variant.price - pricing.unitPrice) * qty
    }

    items.push({
      product: product.id,
      title: product.title,
      brandTitle: brand,
      sku: variant.sku,
      volume: variant.volume,
      price: pricing.unitPrice,
      qty,
      lineTotal: pricing.unitPrice * qty,
      // Снапшот скидки этой позиции — чтобы заявка помнила, что применилось,
      // даже если каталог потом изменится.
      ...(pricing.finalPercent > 0
        ? {
            basePrice: pricing.base,
            discountPercent: pricing.finalPercent,
            discountSource: pricing.source,
          }
        : {}),
    })
  }

  return { items, promoSaving, promoWonAnywhere }
}
