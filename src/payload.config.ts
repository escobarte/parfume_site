import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Brands } from './collections/Brands'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Notes } from './collections/Notes'
import { Orders } from './collections/Orders'
import { Products } from './collections/Products'
import { Users } from './collections/Users'
import { Homepage } from './globals/Homepage'
import { Navigation } from './globals/Navigation'
import { Settings } from './globals/Settings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Products, Brands, Categories, Notes, Media, Orders, Users],
  globals: [Homepage, Settings, Navigation],
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
