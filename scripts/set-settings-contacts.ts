import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config.js'

/**
 * Разовый узкий скрипт — заполняет ТОЛЬКО `settings.contacts.{phone,email,
 * address}` (глобал «Настройки сайта»), если они ещё пусты. Не трогает
 * ничего больше в Settings (siteName/tagline/messengers/social/footerNote/
 * promoBanner) и ничего в других коллекциях — тот же принцип безопасности,
 * что у `scripts/seed-pages-only.ts`: заполняет только то, что реально
 * пусто, уже заполненное поле не перезаписывает молча.
 *
 * Значения подтверждены владельцем в чате (2026-09-06): телефон/email — те
 * же, что уже публично показаны на заглушке «сайт в разработке»
 * (`MaintenanceContacts.tsx`), адрес — черновик ПРОМПТ 13, задача 3.
 *
 * ВАЖНО: подключение к БД — из `DATABASE_URI` процесса. Запускать ИЗНУТРИ
 * прод-контейнера (Coolify → приложение → Terminal):
 *
 *   ./node_modules/.bin/tsx scripts/set-settings-contacts.ts
 *
 * После запуска ОБЯЗАТЕЛЬНО сбросить кэш витрины (кнопка «Сбросить кэш
 * витрины» на `/admin/catalog-import`, либо открыть/сохранить любой
 * документ в `/admin`) — этот скрипт, как и `pnpm seed`/`seed-pages-only.ts`,
 * работает вне рантайма Next (CLI-процесс), `revalidateTag` внутри хука
 * Settings (`afterChange`) в таком контексте тихо гасится исключением (см.
 * комментарий в `src/lib/revalidate.ts`) — до уже запущенного сервера не
 * долетает. Без сброса кэша `/about` может ещё до ~5 минут (`CACHE_TTL`)
 * показывать старое (пустое) состояние контактов.
 */

const LOCALES = ['ro', 'ru', 'en'] as const
type Locale = (typeof LOCALES)[number]

const PHONE = '+373 78 201 802'
const EMAIL = 'monflacon.md@gmail.com'
const ADDRESS: Record<Locale, string> = {
  ro: 'Moldova, Chișinău, str. Mihail Kogălniceanu 46',
  ru: 'Moldova, Chișinău, str. Mihail Kogălniceanu 46',
  en: 'Moldova, Chisinau, 46 Mihail Kogălniceanu St.',
}

async function main() {
  console.log(`DATABASE_URI: ${(process.env.DATABASE_URI ?? '').replace(/:[^:@]*@/, ':***@')}`)
  const payload = await getPayload({ config })

  for (const locale of LOCALES) {
    // fallbackLocale: false обязателен для проверки «пусто ли локализованное
    // поле» (address) — у проекта fallback: true в конфиге, поэтому обычное
    // чтение пустой ru/en-версии вернёт текст ro и замаскирует пустоту (см.
    // docs/GOTCHAS.md). Без этой опции скрипт решил бы, что en уже заполнен
    // (ro-текстом через fallback), и не проставил бы англоязычный адрес.
    const settings = await payload.findGlobal({ slug: 'settings', locale, fallbackLocale: false })
    const contacts = settings.contacts ?? {}

    const nextPhone = contacts.phone || PHONE
    const nextEmail = contacts.email || EMAIL
    const nextAddress = contacts.address || ADDRESS[locale]

    await payload.updateGlobal({
      slug: 'settings',
      locale,
      data: {
        contacts: {
          phone: nextPhone,
          email: nextEmail,
          address: nextAddress,
          // Не трогаем — сохраняем текущее значение как есть (могло быть
          // заполнено отдельно, к контактам this не относится).
          workingHours: contacts.workingHours,
          mapUrl: contacts.mapUrl,
        },
      },
    })

    console.log(
      `[${locale}] phone=${nextPhone}${contacts.phone ? ' (уже было)' : ' ← заполнено'}, ` +
        `email=${nextEmail}${contacts.email ? ' (уже было)' : ' ← заполнено'}, ` +
        `address="${nextAddress}"${contacts.address ? ' (уже было)' : ' ← заполнено'}`,
    )
  }

  console.log(
    '\nГотово. Обязательно сбросить кэш витрины (см. комментарий вверху файла) — иначе /about может ещё показывать старое состояние.',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
