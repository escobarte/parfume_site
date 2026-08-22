import type { Endpoint, PayloadRequest } from 'payload'
import AdmZip from 'adm-zip'
import path from 'path'
import { isAdmin } from '@/access/roles'
import { list } from '@/lib/import/format'

// Архив в пределах сотен МБ (несколько сотен фото по паре МБ каждое),
// отдельный файл — единицы МБ (см. docs/import-guide.md, рекомендация
// клиенту: квадратные ~1200×1200, до 1 МБ — лимит даёт запас сверху).
const MAX_ZIP_BYTES = 200 * 1024 * 1024
const MAX_ENTRY_BYTES = 8 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const forbidden = () => new Response('Forbidden', { status: 403 })

const badRequest = (message: string) => Response.json({ ok: false, reportText: message }, { status: 400 })

type MediaPlan = {
  created: string[]
  reused: string[]
  skipped: { name: string; reason: string }[]
}

/** Имя файла без расширения → черновой alt-текст (владелец правит вручную при желании). */
const humanizeAlt = (filename: string): string => {
  const base = path.basename(filename, path.extname(filename)).replace(/[-_]+/g, ' ').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : filename
}

function formatMediaReport(plan: MediaPlan): string {
  const lines: string[] = []
  lines.push('Загрузка фото из архива')
  lines.push('')
  lines.push(
    `Принято новых файлов: ${plan.created.length}${plan.created.length ? ` — ${list(plan.created)}` : ''}`,
  )
  lines.push(
    `Уже было в медиатеке, переиспользовано: ${plan.reused.length}${plan.reused.length ? ` — ${list(plan.reused)}` : ''}`,
  )
  if (plan.skipped.length) {
    lines.push(`Пропущено: ${plan.skipped.length}`)
    for (const item of plan.skipped.slice(0, 50)) {
      lines.push(`  ${item.name}: ${item.reason}`)
    }
    if (plan.skipped.length > 50) lines.push(`  … и ещё ${plan.skipped.length - 50}`)
  }
  return lines.join('\n')
}

/**
 * Загрузка фото товаров архивом — /admin/catalog-import, отдельный блок над
 * CSV-импортом (см. MediaImportForm.tsx). Штатный путь Payload upload
 * (payload.create с `file: {data, mimetype, name, size}` — Buffer в памяти,
 * без записи на диск: тот же принцип, что и у CSV-импорта, см.
 * adminCatalog.ts, — чтобы не упереться в non-root-ограничение записи под
 * /app в прод-контейнере, docs/GOTCHAS.md). Результат — обычные документы
 * Media со всеми генерируемыми размерами (thumb/card/full), не файлы мимо
 * коллекции.
 *
 * Дедуп по имени файла: если в медиатеке уже есть файл с таким именем — не
 * плодим второй, переиспользуем существующий id (CSV подтягивает фото по
 * имени файла, см. src/lib/import/images.ts).
 */
export const adminMediaEndpoints: Endpoint[] = [
  {
    path: '/media-import',
    method: 'post',
    handler: async (req) => {
      if (!isAdmin(req.user)) return forbidden()

      if (typeof req.formData !== 'function') {
        return badRequest('запрос не поддерживает загрузку файла (formData недоступен)')
      }

      let form: FormData
      try {
        form = await req.formData()
      } catch {
        return badRequest('ожидался multipart/form-data с ZIP-архивом')
      }

      const file = form.get('file')
      if (!(file instanceof File) || !file.size) {
        return badRequest('ZIP-архив не выбран')
      }
      if (file.size > MAX_ZIP_BYTES) {
        return badRequest(
          `архив больше ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} МБ — разбейте фото на несколько загрузок`,
        )
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      let entries: AdmZip.IZipEntry[]
      try {
        entries = new AdmZip(buffer).getEntries()
      } catch {
        return badRequest('не удалось прочитать архив — файл повреждён или это не ZIP')
      }

      const plan: MediaPlan = { created: [], reused: [], skipped: [] }
      const handledInThisRun = new Set<string>()

      for (const entry of entries) {
        if (entry.isDirectory) continue

        const name = entry.name
        if (!name || name.startsWith('.')) {
          plan.skipped.push({ name: name || entry.entryName, reason: 'служебный файл, пропущен' })
          continue
        }
        if (handledInThisRun.has(name)) {
          plan.skipped.push({ name, reason: 'повторяющееся имя внутри архива — уже обработан' })
          continue
        }

        const ext = path.extname(name).toLowerCase()
        const mimetype = MIME_BY_EXT[ext]
        if (!mimetype) {
          plan.skipped.push({
            name,
            reason: 'неподдерживаемый тип файла (принимаются jpg/jpeg/png/webp)',
          })
          continue
        }

        if (entry.header.size > MAX_ENTRY_BYTES) {
          plan.skipped.push({
            name,
            reason: `превышает лимит ${Math.round(MAX_ENTRY_BYTES / 1024 / 1024)} МБ на файл`,
          })
          continue
        }

        let data: Buffer
        try {
          data = entry.getData()
        } catch {
          plan.skipped.push({ name, reason: 'файл повреждён внутри архива' })
          continue
        }
        if (!data?.length) {
          plan.skipped.push({ name, reason: 'файл повреждён или пуст' })
          continue
        }

        handledInThisRun.add(name)

        const existing = await req.payload.find({
          collection: 'media',
          where: { filename: { equals: name } },
          limit: 1,
          depth: 0,
          req: req as PayloadRequest,
        })

        if (existing.docs[0]) {
          plan.reused.push(name)
          continue
        }

        const alt = humanizeAlt(name)
        const created = await req.payload.create({
          collection: 'media',
          locale: 'ro',
          data: { alt },
          file: { data, mimetype, name, size: data.length },
          req: req as PayloadRequest,
        })

        for (const locale of ['ru', 'en'] as const) {
          await req.payload.update({
            collection: 'media',
            id: created.id,
            locale,
            data: { alt },
            req: req as PayloadRequest,
          })
        }

        plan.created.push(name)
      }

      return Response.json({ ok: true, reportText: formatMediaReport(plan) })
    },
  },
]
