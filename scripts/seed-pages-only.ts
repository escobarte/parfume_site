import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from '../src/payload.config.js'
import { paragraphs } from '../src/lib/seed/richText.js'

/**
 * Разовый узкий скрипт — СОЗДАЁТ только 4 системных документа `Pages`
 * (about/delivery/returns/contacts), НЕ трогает brands/categories/notes/
 * products/homepage/settings/navigation, в отличие от полного `pnpm seed`.
 *
 * Зачем отдельно от seed.ts: полный `pnpm seed` на проде запускать нельзя —
 * он реально пишет во ВСЕ коллекции по upsert-логике (`upsertBySlug`
 * обновляет существующий документ по совпавшему slug), а не только создаёт
 * недостающее. На проде это означало бы риск затереть реальные товары/бренды
 * демо-данными при случайном запуске. Этот скрипт — только про 4 страницы,
 * и только СОЗДАЁТ отсутствующее: если документ с таким slug уже есть
 * (например, владелец уже написал реальный текст через /admin) — НЕ трогает
 * его и просто сообщает об этом, чтобы не затереть чужую правку молча.
 *
 * ВАЖНО: подключение к БД берётся из переменной окружения `DATABASE_URI`
 * процесса, в котором запущен скрипт. Запускать нужно ИЗНУТРИ прод-
 * контейнера (Coolify → приложение → Terminal), иначе он отработает против
 * локальной dev-базы и на проде ничего не изменит:
 *
 *   ./node_modules/.bin/tsx scripts/seed-pages-only.ts
 *
 * (не `pnpm run` — в прод-контейнере это не работает, см. docs/GOTCHAS.md,
 * «Non-root `nextjs`… pnpm <script> внутри этого контейнера не работает»).
 *
 * Текст — тот же черновик ПРОМПТ 13/фазы 5.2, что и в `scripts/seed.ts`,
 * PLACEHOLDER до вычитки владельцем/клиентом (см. docs/translations-review.md).
 *
 * После запуска обязательно сбросить кэш витрины (кнопка «Сбросить кэш
 * витрины» на `/admin/catalog-import`, либо сохранить любой документ `Pages`
 * в /admin) — иначе можно словить уже задокументированный в GOTCHAS.md баг
 * «закэшированный null у getPageBySlug даёт настоящий 404 после создания
 * документа» (тот же процесс revalidateTag из CLI не долетает до уже
 * запущенного сервера).
 */

const LOCALES = ['ro', 'ru', 'en'] as const
type Locale = (typeof LOCALES)[number]

const pages: {
  slug: 'about' | 'delivery' | 'returns' | 'contacts'
  title: Record<Locale, string>
  body: Record<Locale, string[]>
}[] = [
  {
    slug: 'about',
    title: { ro: 'Despre noi', ru: 'О нас', en: 'About us' },
    body: {
      ro: [
        'MON FLACON este un catalog de parfumuri pentru Moldova. Adunăm arome pe care vrei să le porți în fiecare zi — de la note florale ușoare până la arome orientale intense — și te ajutăm să o găsești pe a ta, fără să cutreieri zece magazine.',
        'Comanda se face fără înregistrare: alegi volumul, lași o cerere — te contactăm pentru a confirma disponibilitatea și a stabili livrarea sau ridicarea personală.',
      ],
      ru: [
        'MON FLACON — небольшой парфюмерный каталог для Молдовы. Мы собираем ароматы, которые хочется носить каждый день: от лёгких цветочных до плотных восточных, — и помогаем подобрать свой без похода по десяти магазинам.',
        'Заказ оформляется без регистрации: выбрали объём, оставили заявку — мы свяжемся, чтобы подтвердить наличие и договориться о доставке или самовывозе.',
      ],
      en: [
        'MON FLACON is a perfume catalog for Moldova. We curate scents you’ll want to wear every day — from light floral notes to rich oriental blends — and help you find yours without visiting ten stores.',
        'Ordering doesn’t require an account: pick a size, leave a request, and we’ll get in touch to confirm availability and arrange delivery or pickup.',
      ],
    },
  },
  {
    slug: 'delivery',
    title: { ro: 'Livrare', ru: 'Доставка', en: 'Delivery' },
    body: {
      ro: [
        'Livrăm în Chișinău și în toată Moldova. După ce trimiteți cererea din coșul de cumpărături, un consultant vă contactează pentru a confirma comanda, adresa și metoda de livrare.',
        'Plata se face la livrare sau prin transfer, în funcție de înțelegerea cu consultantul. Termenul de livrare în Chișinău este de obicei 1–2 zile lucrătoare.',
      ],
      ru: [
        'Доставляем по Кишинёву и всей Молдове. После отправки заявки из корзины с вами свяжется консультант, чтобы подтвердить заказ, адрес и способ доставки.',
        'Оплата — при получении или переводом, по договорённости с консультантом. Срок доставки по Кишинёву обычно 1–2 рабочих дня.',
      ],
      en: [
        'We deliver across Chisinau and all of Moldova. After you submit a request from the cart, a consultant will contact you to confirm the order, address, and delivery method.',
        'Payment is on delivery or by transfer, as agreed with the consultant. Delivery within Chisinau usually takes 1–2 business days.',
      ],
    },
  },
  {
    slug: 'returns',
    title: { ro: 'Retur', ru: 'Возврат', en: 'Returns' },
    body: {
      ro: [
        'Dacă parfumul ales nu vi se potrivește, ne puteți contacta în 14 zile de la primire pentru retur sau schimb — flaconul trebuie să fie nedeschis și în ambalajul original.',
        'Pentru a începe un retur, scrieți-ne prin mesagerul indicat în comandă sau folosiți pagina de urmărire a comenzii pentru a găsi datele de contact.',
      ],
      ru: [
        'Если выбранный аромат не подошёл, можно обратиться в течение 14 дней с момента получения для возврата или обмена — флакон должен быть невскрытым, в оригинальной упаковке.',
        'Чтобы оформить возврат, напишите нам в мессенджер, указанный при оформлении заказа, либо найдите контакты на странице отслеживания заказа.',
      ],
      en: [
        'If the scent you chose isn’t the right fit, you can reach us within 14 days of receiving it for a return or exchange — the bottle must be unopened and in its original packaging.',
        'To start a return, message us via the channel you used at checkout, or find our contact details on the order status page.',
      ],
    },
  },
  {
    slug: 'contacts',
    title: { ro: 'Contacte', ru: 'Контакты', en: 'Contacts' },
    body: {
      ro: [
        'Ne găsiți în Chișinău. Pentru întrebări despre comenzi, livrare sau selecție, scrieți-ne pe unul dintre mesageriile disponibile — vă răspundem în aceeași zi lucrătoare.',
        'Datele de contact actuale (adresă, telefon, mesagerii) sunt afișate în subsolul paginii.',
      ],
      ru: [
        'Мы находимся в Кишинёве. По вопросам заказа, доставки или подбора аромата пишите в любой из доступных мессенджеров — отвечаем в течение того же рабочего дня.',
        'Актуальные контакты (адрес, телефон, мессенджеры) — в подвале сайта.',
      ],
      en: [
        'We are based in Chisinau. For questions about orders, delivery, or finding the right scent, message us on any of the available channels — we reply within the same business day.',
        'Current contact details (address, phone, messengers) are shown in the site footer.',
      ],
    },
  },
]

async function createIfMissing(payload: Payload, page: (typeof pages)[number]) {
  const existing = await payload.find({
    collection: 'pages',
    where: { slug: { equals: page.slug } },
    limit: 1,
    depth: 0,
  })

  if (existing.docs[0]) {
    console.log(`— «${page.slug}» уже существует (id ${existing.docs[0].id}) — пропущено, не тронуто`)
    return
  }

  const created = await payload.create({
    collection: 'pages',
    locale: 'ro',
    data: { slug: page.slug, title: page.title.ro, body: paragraphs(...page.body.ro) },
  })

  for (const locale of LOCALES.filter((l) => l !== 'ro')) {
    await payload.update({
      collection: 'pages',
      id: created.id,
      locale,
      data: { title: page.title[locale], body: paragraphs(...page.body[locale]) },
    })
  }

  console.log(`✔ «${page.slug}» создан (id ${created.id}), заполнен на ro/ru/en`)
}

async function main() {
  console.log(`DATABASE_URI: ${(process.env.DATABASE_URI ?? '').replace(/:[^:@]*@/, ':***@')}`)
  const payload = await getPayload({ config })
  for (const page of pages) {
    await createIfMissing(payload, page)
  }
  console.log('\nГотово. Не забудь сбросить кэш витрины (кнопка на /admin/catalog-import) — иначе можно словить кэш-баг с notFound(), см. GOTCHAS.md.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
