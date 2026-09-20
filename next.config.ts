import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  output: 'standalone',
  /**
   * Только для dev. Next в режиме разработки отбивает запросы с чужого origin,
   * поэтому при заходе на dev-сервер по адресу в локальной сети (с телефона,
   * с другой машины) страница открывалась, но весь интерактив был мёртв:
   * не работали фильтры, переключатель языка, смена объёма.
   * На прод не влияет — там один домен и обычный origin.
   *
   * ⚠ Адрес в локальной сети не постоянный: он меняется при смене сети, по
   * DHCP и после `wsl --shutdown`. Актуальный смотреть так:
   *   в WSL      — `hostname -I`
   *   в Windows  — `ipconfig` (адрес Wi-Fi/Ethernet, на него ходит телефон)
   * Новый адрес можно либо дописать в массив ниже, либо разово передать
   * без правки кода: `DEV_ORIGINS=192.168.0.5 pnpm dev` (через запятую — несколько).
   */
  allowedDevOrigins: [
    '10.221.66.166',
    ...(process.env.DEV_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []),
  ],
  /**
   * Шрифты печатного PDF заявки (src/lib/orders/fonts/*.ttf) читаются в
   * рантайме обычным fs — трассировка Next такие файлы сама не видит и в
   * standalone-сборку не кладёт. Без этой строки PDF падает в проде с
   * «Шрифты Inter для PDF не найдены», хотя в dev всё работает.
   *
   * Ключи — маршруты, где PDF собирается: приём заявки (письмо менеджеру) и
   * catch-all Payload (эндпойнт скачивания из админки).
   */
  outputFileTracingIncludes: {
    '/api/order-request': ['./src/lib/orders/fonts/**'],
    '/api/[...slug]': ['./src/lib/orders/fonts/**'],
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(withNextIntl(nextConfig), { devBundleServerPackages: false })
