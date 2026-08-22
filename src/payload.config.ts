import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { en } from '@payloadcms/translations/languages/en'
import { ro } from '@payloadcms/translations/languages/ro'
import { ru } from '@payloadcms/translations/languages/ru'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Brands } from './collections/Brands'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Notes } from './collections/Notes'
import { Orders } from './collections/Orders'
import { Pages } from './collections/Pages'
import { Products } from './collections/Products'
import { Users } from './collections/Users'
import { Homepage } from './globals/Homepage'
import { Navigation } from './globals/Navigation'
import { Settings } from './globals/Settings'
import { adminCatalogEndpoints } from './endpoints/adminCatalog'
import { adminMediaEndpoints } from './endpoints/adminMedia'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      // Логотип/акценты MON FLACON поверх стандартного layout (фаза 4.7.6) —
      // структура экранов Payload admin не трогается, см. src/app/(payload)/custom.scss.
      graphics: {
        Icon: '@/components/admin/BrandIcon#BrandIcon',
        Logo: '@/components/admin/BrandLogo#BrandLogo',
      },
      beforeDashboard: ['@/components/admin/NewOrdersCard#NewOrdersCard'],
      // Явный «Выйти» в always-visible зоне шапки (багфикс приёмки 4.7.5) —
      // штатная кнопка живёт в свёрнутой по умолчанию Nav-шторке и не видна
      // без клика по гамбургеру, см. LogoutAction.tsx.
      actions: ['@/components/admin/LogoutAction#LogoutAction'],
      // Точка входа на экран импорта CSV (задача 2 фазы 8.1) — только admin,
      // роль проверяется внутри самого компонента (ImportNavLink.tsx).
      afterNavLinks: ['@/components/admin/ImportNavLink#ImportNavLink'],
      views: {
        // /admin/catalog-import — экран загрузки CSV, см. ImportView.tsx.
        // Payload сам оборачивает зарегистрированный здесь Component в
        // штатный DefaultTemplate (шапка/сайдбар), доступ внутри компонента.
        catalogImport: {
          Component: '@/components/admin/ImportView#ImportView',
          path: '/catalog-import',
          exact: true,
        },
      },
    },
  },
  // supportedLanguages задаёт РЕАЛЬНЫЙ выбор языка интерфейса /admin (фаза
  // 4.7.5) — до этого был только английский дефолт Payload, из-за чего
  // переключатель ro/ru/en ничего не менял. fallbackLanguage — язык нового
  // пользователя без сохранённого выбора (клиент по умолчанию — русский).
  // Не путать с next-intl локалями витрины: у Payload admin своя i18n.
  i18n: {
    supportedLanguages: { en, ro, ru },
    fallbackLanguage: 'ru',
  },
  collections: [Products, Brands, Categories, Notes, Pages, Media, Orders, Users],
  globals: [Homepage, Settings, Navigation],
  // Импорт каталога, загрузка фото архивом и сброс кэша витрины из /admin —
  // вне пространства коллекций (не /api/<slug>, см. docs/GOTCHAS.md «Роуты и API»).
  endpoints: [...adminCatalogEndpoints, ...adminMediaEndpoints],
  editor: lexicalEditor(),
  localization: {
    locales: ['ro', 'ru', 'en'],
    defaultLocale: 'ro',
    fallback: true,
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
    // Схема ведётся миграциями, а не drizzle-push: push задаёт интерактивные
    // вопросы про переименование колонок и не воспроизводится на проде.
    // Изменил схему → `pnpm payload migrate:create` + `pnpm payload migrate`.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
  plugins: [],
})
