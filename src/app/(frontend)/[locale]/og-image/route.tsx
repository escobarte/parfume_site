import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo/config'

export const runtime = 'edge'

const NAVY = '#16293D'
const CREAM = '#E8CFB0'

/**
 * Брендованный fallback для OG/Twitter-превью (фаза 7.1) — используется,
 * когда у страницы нет своей CMS-картинки или реального фото товара
 * (`buildMetadata`, `src/lib/seo/metadata.ts`). Знак бренда рисуется тем
 * же контуром, что `BrandMark` (viewBox 100×118), но как сырой SVG —
 * `ImageResponse` рендерит через Satori, не настоящий браузер, произвольные
 * React-компоненты с Tailwind-классами сюда не переносятся.
 */
export function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get('title')?.slice(0, 90) || SITE_NAME

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
        <svg width="90" height="106" viewBox="0 0 100 118" fill="none">
          <rect x="44" y="6" width="12" height="9" rx="1.5" stroke={CREAM} strokeWidth={4} />
          <path d="M50 15v89M28 28h44" stroke={CREAM} strokeWidth={4} />
          <path
            d="M35.6 41.2A34 34 0 1 0 64.4 41.2"
            stroke={CREAM}
            strokeWidth={4}
            fill="none"
          />
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
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
