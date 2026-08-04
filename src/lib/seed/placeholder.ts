import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

/**
 * Плейсхолдер карточки товара: тёплая поверхность + силуэт флакона по знаку
 * бренда (BRAND.md §5, WIREFRAMES.md §3). Реальные фото придут от клиента.
 */
const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (char) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] as string,
  )

function bottleSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#F6F0E4"/>
  <g fill="none" stroke="#16293D" stroke-width="6">
    <rect x="470" y="250" width="260" height="90" rx="4"/>
    <path d="M540 340 h120 v70 q90 40 90 150 v290 q0 60 -60 60 h-180 q-60 0 -60 -60 v-290 q0 -110 90 -150 z"/>
    <path d="M470 620 h260"/>
  </g>
  <text x="600" y="960" text-anchor="middle" font-family="Inter, sans-serif" font-size="34"
        letter-spacing="8" fill="#4A5A6B">${escapeXml(label.toUpperCase())}</text>
</svg>`
}

export async function makePlaceholder(label: string, outDir: string, name: string) {
  await mkdir(outDir, { recursive: true })
  const filePath = path.join(outDir, `${name}.png`)
  const png = await sharp(Buffer.from(bottleSvg(label)))
    .png()
    .toBuffer()
  await writeFile(filePath, png)
  return filePath
}
