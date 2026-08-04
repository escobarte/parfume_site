import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Пропускаем /admin и /api (Payload), Next-служебные пути и файлы со статикой
  matcher: ['/((?!admin|api|_next|_vercel|.*\\..*).*)'],
}
