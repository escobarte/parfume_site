import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Пропускаем /admin и /api (Payload), Next-служебные пути, файлы со статикой
  // (есть точка в пути — /robots.txt, /sitemap.xml) и file-convention
  // роуты без расширения в URL (/icon — favicon через ImageResponse, фаза
  // 7.4): без точки в пути они не подпадали под `.*\\..*` и мидлварь
  // редиректил их на /ro/icon, где такого маршрута нет — 404.
  matcher: ['/((?!admin|api|_next|_vercel|icon|apple-icon|.*\\..*).*)'],
}
