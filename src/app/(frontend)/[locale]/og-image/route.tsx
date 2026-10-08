import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo/config'

export const runtime = 'edge'

// Значения — src/styles/tokens.css: --color-navy (строка 17), --color-cream
// (строка 18). ImageResponse рендерит через Satori, не настоящий браузер —
// CSS-переменные ему недоступны, поэтому цвета продублированы тут константами.
const NAVY = '#16293D'
const CREAM = '#E8CFB0'

/** ArrayBuffer → base64 без `Buffer` — в edge-рантайме его может не быть
 * (тот же класс ограничения, что у `node:crypto` в мидлвари, см. GOTCHAS.md). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Форматы, которые Satori (рендерер `next/og`) реально умеет декодировать
 * как растровую картинку. **WebP не входит** — проверено живьём: `<img>` с
 * `data:image/webp` не кидает ошибку синхронно (сам `ImageResponse()` строится
 * нормально), роут отдаёт 200, но стриминг тела падает уже ПОСЛЕ ответа
 * (`TypeError: u2 is not iterable` при попытке Next отдать тело клиенту) —
 * то есть `try/catch` вокруг конструктора `ImageResponse` эту ошибку
 * физически не ловит, она происходит позже. Конвертация в PNG недоступна:
 * edge-рантайм не тащит `sharp`. Поэтому формат проверяется ДО вызова
 * `ImageResponse` — неподдерживаемый откатывается на фирменный fallback,
 * как и сбой скачивания.
 */
const SUPPORTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

/**
 * Логотип бренда скачивается и встраивается сам (data URI), а не отдаётся
 * Satori как удалённый URL напрямую — так сбой скачивания (битая ссылка,
 * временная недоступность медиа-хоста) ловится здесь и превью откатывается
 * на фирменный fallback вместо падения всего роута с 500.
 */
async function fetchLogoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/png'
    if (!SUPPORTED_LOGO_TYPES.includes(contentType)) return null
    const buffer = await res.arrayBuffer()
    return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`
  } catch {
    return null
  }
}

/**
 * Брендованный fallback для OG/Twitter-превью (фаза 7.1) — используется,
 * когда у страницы нет своей CMS-картинки/реального фото товара (`buildMetadata`,
 * `src/lib/seo/metadata.ts`), и для страницы бренда без логотипа. Знак —
 * те же SVG-пути, что `BrandMark` (`src/components/brand/BrandMark.tsx`,
 * viewBox 202 189.6 474.9 470), скопированы сюда как сырой SVG: произвольные
 * React-компоненты с Tailwind-классами в Satori не переносятся.
 *
 * Параметр `logo` (абсолютный URL) — превью страницы бренда с загруженным
 * логотипом: тот же navy-холст, вместо знака — сам логотип целиком, без
 * обрезки (`object-fit: contain`), с запасом по краям. Логотипы разной формы
 * (квадрат, круглая эмблема, вытянутый вордмарк) вписываются одинаково.
 */
export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get('title')?.slice(0, 90) || SITE_NAME
  // Подпись под линией по умолчанию — дескриптор бренда; заглушка «сайт в
  // разработке» (фаза 9.2) переопределяет её на «Find your signature.».
  const subtitle = request.nextUrl.searchParams.get('subtitle')?.slice(0, 60) || SITE_TAGLINE
  const logoParam = request.nextUrl.searchParams.get('logo')

  const logoDataUrl = logoParam ? await fetchLogoDataUrl(logoParam) : null

  if (logoDataUrl) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: NAVY,
            padding: 100,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image недоступен внутри next/og ImageResponse (рендерит Satori, не браузер) */}
          <img
            src={logoDataUrl}
            alt={title}
            width={1000}
            height={430}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      ),
      { width: 1200, height: 630 },
    )
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: NAVY,
          padding: 80,
        }}
      >
        <svg width="107" height="106" viewBox="202 189.6 474.9 470" fill={CREAM}>
          <path d="M444.44,288.2v-10.01h0v-4.52s68.75,0,68.75,0v-10.67h-68.75s0-13.26,0-13.26h19.03c3.15,0,5.7-2.55,5.7-5.7v-32.64c0-3.15-2.55-5.7-5.7-5.7h-48.06c-3.15,0-5.7,2.55-5.7,5.7v32.64c0,3.15,2.55,5.7,5.7,5.7h19.03v13.26s-68.78,0-68.78,0v10.67h68.78s0,38.51,0,38.51h0v297.13c-86.28-2.64-155.66-73.65-155.66-160.56,0-65.6,39.53-122.12,96.01-147.04l-4.2-9.08c-59.91,26.51-101.81,86.51-101.81,156.13,0,92.43,73.86,167.92,165.66,170.57,1.66.05,3.31.08,4.98.08s3.35-.03,5.02-.08v-10.01s0-321.12,0-321.12Z" />
          <path d="M542.86,313.14l-6.04,7.97c38.42,29.38,63.25,75.67,63.25,127.66,0,76.2-53.33,140.17-124.63,156.56l2.01,9.8c75.85-17.33,132.62-85.34,132.62-166.36,0-55.24-26.39-104.42-67.21-135.62Z" />
        </svg>
        <div
          style={{
            marginTop: 48,
            fontSize: 56,
            fontWeight: 300,
            color: CREAM,
            textAlign: 'center',
            letterSpacing: 2,
            textTransform: 'uppercase',
            maxWidth: 900,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 28,
            width: 64,
            height: 1,
            backgroundColor: 'rgba(232,207,176,0.45)',
          }}
        />
        <div
          style={{
            marginTop: 28,
            fontSize: 24,
            fontWeight: 300,
            color: '#8FA0B2',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          {subtitle}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
