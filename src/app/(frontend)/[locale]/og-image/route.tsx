import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo/config'

// Без `export const runtime = 'edge'` (был здесь раньше) — sharp требует
// нативный биндинг, недоступный в edge-рантайме (тот же класс ограничения,
// что у `Buffer`/`node:crypto` там же, см. GOTCHAS.md). Node-рантайм для
// `ImageResponse` в проекте уже используется — `src/app/icon.tsx`.

// Значения — src/styles/tokens.css: --color-navy (строка 17), --color-cream
// (строка 18), --color-surface-warm (строка 20, «тёплый нейтральный фон...
// фото-зон» — тот же токен, что у фото-зоны карточки товара и у логотипа на
// /brands, `bg-surface-warm` в `ProductCard.tsx`/`Gallery.tsx`/`BrandCard.tsx`).
// ImageResponse рендерит через Satori, не настоящий браузер — CSS-переменные
// ему недоступны, поэтому цвета продублированы тут константами.
const NAVY = '#16293D'
const CREAM = '#E8CFB0'
const SURFACE_WARM = '#F6F0E4'

/** Входной файл логотипа крупнее этого — не читаем вовсе (память процесса, не только edge). */
const MAX_LOGO_BYTES = 10 * 1024 * 1024
/** Длинная сторона результата — логотип в OG-карточке крупнее реально не нужен. */
const LOGO_MAX_DIMENSION = 1000
/** Скачивание логотипа не должно вешать весь роут, если медиа-хост медленный/недоступен. */
const LOGO_FETCH_TIMEOUT_MS = 8000

/**
 * Логотип бренда может прийти в любом формате, который Payload принимает на
 * загрузку (PNG/JPEG/WebP/GIF/AVIF/SVG) — Satori же умеет рендерить как
 * `<img>` надёжно только PNG/JPEG (см. GOTCHAS.md: WebP не кидает ошибку
 * при построении `ImageResponse`, роут отвечает 200, но падает уже при
 * стриминге тела). Поэтому логотип не отдаётся Satori как есть — скачивается
 * и прогоняется через `sharp` в PNG здесь, в Node-рантайме этого роута.
 * Любой сбой (битая ссылка, таймаут, нечитаемый sharp'ом файл, файл больше
 * `MAX_LOGO_BYTES`) — `null`, вызывающий код откатывается на фирменный
 * fallback вместо падения всего превью.
 */
async function logoToPngDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS) })
    if (!res.ok) return null

    const contentLength = Number(res.headers.get('content-length') ?? 0)
    if (contentLength > MAX_LOGO_BYTES) return null

    const input = Buffer.from(await res.arrayBuffer())
    if (input.byteLength > MAX_LOGO_BYTES) return null

    const png = await sharp(input, { failOn: 'none' })
      .resize({
        width: LOGO_MAX_DIMENSION,
        height: LOGO_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer()

    return `data:image/png;base64,${png.toString('base64')}`
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
 * логотипом: тёплый светлый холст (`--color-surface-warm`, тот же фон, что
 * у фото товара), логотип по центру, целиком, без обрезки (`object-fit:
 * contain`), с запасом не менее ~15% по каждому краю. Тёмные/контурные лого
 * (как у настоящих fashion-брендов) тонут на navy — светлый фон читается
 * одинаково для любого цвета лого, поэтому тут нет ни navy, ни подписи под
 * знаком: сам логотип уже несёт название бренда.
 */
export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get('title')?.slice(0, 90) || SITE_NAME
  // Подпись под линией по умолчанию — дескриптор бренда; заглушка «сайт в
  // разработке» (фаза 9.2) переопределяет её на «Find your signature.».
  const subtitle = request.nextUrl.searchParams.get('subtitle')?.slice(0, 60) || SITE_TAGLINE
  const logoParam = request.nextUrl.searchParams.get('logo')

  const logoDataUrl = logoParam ? await logoToPngDataUrl(logoParam) : null

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
            backgroundColor: SURFACE_WARM,
            // 190/1200 = 15.8% по горизонтали, 95/630 = 15.1% по вертикали.
            paddingLeft: 190,
            paddingRight: 190,
            paddingTop: 95,
            paddingBottom: 95,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image недоступен внутри next/og ImageResponse (рендерит Satori, не браузер) */}
          <img
            src={logoDataUrl}
            alt={title}
            width={820}
            height={440}
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
