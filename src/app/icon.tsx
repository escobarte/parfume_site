import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

/*
 * Фавикон витрины — знак бренда на navy-плашке (BRAND.md §4: знак отдельно
 * для мелких форматов). Раньше — приближённая обводка от руки (SVG-пути);
 * с 2026-09-08 — финальный PNG от дизайнера (`docs/logo/Mon Flacon Logo
 * icon blue.png`, тот же файл, что и знак в шапке `/admin`, копия рядом
 * с этим файлом — `next/og` ImageResponse не умеет читать произвольный
 * путь в рантайме без сборки, поэтому ассет держим внутри `src/app/`, не
 * в `docs/`). Скругление угла (`borderRadius`) сохранено тем же приёмом,
 * что и раньше — оно не часть самого PNG (там прямоугольная плашка).
 *
 * Путь — строкой через `process.cwd()`, не `new URL(..., import.meta.url)`:
 * Turbopack-сборка этого роута падает на `readFileSync(URL)` с «path argument
 * must be of type string…», хотя сам Node.js такой вызов поддерживает —
 * несовместимость именно бандлера, не рантайма.
 */
const iconSrc = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'src/app/mon-flacon-icon-blue.png'),
).toString('base64')}`

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <img src={iconSrc} width={32} height={32} style={{ objectFit: 'cover' }} alt="" />
      </div>
    ),
    { ...size },
  )
}
