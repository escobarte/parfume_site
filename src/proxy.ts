import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
import {
  getBypassToken,
  isMaintenanceEnabled,
  isMaintenanceExempt,
  MAINTENANCE_BYPASS_PARAM,
  MAINTENANCE_COOKIE,
  MAINTENANCE_COOKIE_MAX_AGE,
  MAINTENANCE_PATH,
  resolveMaintenanceLocale,
  timingSafeEqual,
} from '@/lib/maintenance'

const intlMiddleware = createMiddleware(routing)

// Предупреждение на старте: режим включён, но байпаса нет ни у кого, включая
// владельца. Это осознанный fail-closed (см. src/lib/maintenance.ts), но такое
// состояние почти всегда означает незаполненную переменную в панели.
if (isMaintenanceEnabled() && !getBypassToken()) {
  console.warn(
    '[maintenance] MAINTENANCE_MODE=1, но MAINTENANCE_BYPASS_TOKEN пуст — ' +
      'сайт закрыт заглушкой полностью, байпас по секретной ссылке невозможен.',
  )
}

/**
 * Мидлварь витрины. Порядок строго такой:
 *
 *   1. байпас по секретной ссылке `?preview=<MAINTENANCE_BYPASS_TOKEN>`;
 *   2. cookie байпаса — сайт работает как обычно;
 *   3. исключения (`/admin`, `/api`, OG-превью и т.п.);
 *   4. rewrite на заглушку (200 + сохранённый URL, не редирект);
 *   5. штатная логика локалей next-intl.
 *
 * При `MAINTENANCE_MODE≠1` весь блок 1–4 не выполняется вовсе и мидлварь
 * ведёт себя ровно как до фазы 9.2.
 */
export default async function proxy(request: NextRequest) {
  if (!isMaintenanceEnabled()) return intlMiddleware(request)

  const token = getBypassToken()
  const { pathname } = request.nextUrl

  // 1. Секретная ссылка: ставим cookie и убираем токен из адресной строки,
  //    чтобы он не осел в истории браузера, реферерах и логах прокси.
  const preview = request.nextUrl.searchParams.get(MAINTENANCE_BYPASS_PARAM)
  if (preview !== null && (await timingSafeEqual(preview, token))) {
    const target = request.nextUrl.clone()
    target.searchParams.delete(MAINTENANCE_BYPASS_PARAM)
    const response = NextResponse.redirect(target)
    response.cookies.set(MAINTENANCE_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: MAINTENANCE_COOKIE_MAX_AGE,
      path: '/',
    })
    return response
  }

  // 2. Уже впущенные: cookie сверяется с текущим токеном, а не просто «есть».
  const cookie = request.cookies.get(MAINTENANCE_COOKIE)?.value
  if (cookie && (await timingSafeEqual(cookie, token))) {
    return intlMiddleware(request)
  }

  // 3. Исключения — админка, API, служебные файлы и генератор OG-превью.
  if (isMaintenanceExempt(pathname)) {
    return intlMiddleware(request)
  }

  // 4. Заглушка: именно rewrite — статус 200 и исходный URL в адресной строке.
  //    `no-store` обязателен: Cloudflare иначе закэширует заглушку на edge и
  //    после снятия режима часть посетителей продолжит её видеть.
  const target = request.nextUrl.clone()
  target.pathname = `${MAINTENANCE_PATH}/${resolveMaintenanceLocale(
    pathname,
    request.headers.get('accept-language'),
  )}`
  target.search = ''

  const response = NextResponse.rewrite(target)
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  return response
}

export const config = {
  // Пропускаем /admin и /api (Payload), Next-служебные пути, файлы со статикой
  // (есть точка в пути — /robots.txt, /sitemap.xml) и file-convention
  // роуты без расширения в URL (/icon — favicon через ImageResponse, фаза
  // 7.4): без точки в пути они не подпадали под `.*\\..*` и мидлварь
  // редиректил их на /ro/icon, где такого маршрута нет — 404.
  matcher: ['/((?!admin|api|_next|_vercel|icon|apple-icon|.*\\..*).*)'],
}
