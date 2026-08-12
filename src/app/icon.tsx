import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

const NAVY = '#16293D'
const CREAM = '#E8CFB0'

/** Фавикон витрины — знак бренда на navy-плашке (BRAND.md §4: знак отдельно для мелких форматов). */
export default function Icon() {
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
          borderRadius: 4,
        }}
      >
        <svg width="20" height="24" viewBox="0 0 100 118" fill="none">
          <rect x="44" y="6" width="12" height="9" rx="1.5" stroke={CREAM} strokeWidth={7} />
          <path d="M50 15v89M28 28h44" stroke={CREAM} strokeWidth={7} />
          <path
            d="M35.6 41.2A34 34 0 1 0 64.4 41.2"
            stroke={CREAM}
            strokeWidth={7}
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size },
  )
}
