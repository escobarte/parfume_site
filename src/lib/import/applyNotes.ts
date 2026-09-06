import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'
import { slugify } from '@/lib/slugify'
import { toTable } from './csv'
import { ImageResolver } from './images'

const trimmed = z.string().trim()

/**
 * Одна строка словаря нот — /admin/notes-import (ПРОМПТ 12 v2, задача 2;
 * схема CSV сужена до одного `title` промптом 13 — title/description нот
 * больше не localized, названия только на английском).
 */
const noteRow = z.object({
  slug: trimmed.min(1, 'slug: обязателен'),
  title: trimmed.optional(),
  group: trimmed.optional(),
  image: trimmed.optional(),
})

export type NoteRow = z.infer<typeof noteRow>

export type NotesImportRowError = { line: number; message: string }
export type NotesImportMissingImage = { line: number; slug: string; file: string }

export type NotesImportResult = {
  ok: boolean
  dryRun: boolean
  created: string[]
  updated: string[]
  missingImages: NotesImportMissingImage[]
  errors: NotesImportRowError[]
}

// Старая схема (ПРОМПТ 12 v2) — name_ro/name_ru/name_en. Промпт 13 убрал
// localized у title/description нот, три колонки схлопнулись в одну `title`.
// Файл в старом формате не должен тихо приниматься как «title везде пуст,
// строка отклонена как без title» — это отдельная явная ошибка формата.
const LEGACY_LOCALE_COLUMNS = ['name_ro', 'name_ru', 'name_en']

/**
 * Импорт словаря нот CSV-файлом — /admin/notes-import. В отличие от
 * товарного CSV (движок src/lib/import/engine.ts, транзакция «всё или
 * ничего») здесь **построчная терпимость**: опечатка в одной строке не
 * должна блокировать остальные 149 нот партии дизайнера. Иконки грузятся
 * ОТДЕЛЬНО, тем же архивом, что и фото товаров (/api/media-import,
 * src/endpoints/adminMedia.ts) — этот модуль только матчит уже загруженные
 * файлы по имени (ImageResolver, тот же класс, что у товарного импорта).
 */
export async function applyNotesImport(
  payload: Payload,
  csvText: string,
  options: { dryRun: boolean; req?: Partial<PayloadRequest> },
): Promise<NotesImportResult> {
  const { dryRun, req } = options
  const table = toTable(csvText)

  const result: NotesImportResult = {
    ok: true,
    dryRun,
    created: [],
    updated: [],
    missingImages: [],
    errors: [],
  }

  if (!table.records.length) {
    result.ok = false
    result.errors.push({ line: 1, message: 'в файле нет строк данных' })
    return result
  }

  if (!table.header.includes('title')) {
    const legacyColumns = LEGACY_LOCALE_COLUMNS.filter((column) => table.header.includes(column))
    if (legacyColumns.length) {
      result.ok = false
      result.errors.push({
        line: 1,
        message: `старый формат CSV (${legacyColumns.join('/')}) больше не поддерживается — названия нот только на английском, одна колонка «title» вместо трёх`,
      })
      return result
    }
  }

  const imageResolver = new ImageResolver(payload, req)

  for (const record of table.records) {
    const parsed = noteRow.safeParse(record.data)
    if (!parsed.success) {
      result.errors.push({
        line: record.line,
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      })
      continue
    }

    const row = parsed.data
    const slug = slugify(row.slug)
    if (!slug) {
      result.errors.push({ line: record.line, message: 'slug: пуст после нормализации' })
      continue
    }

    let imageId: number | string | undefined
    if (row.image) {
      const { ids, missing } = await imageResolver.resolveMany([row.image])
      if (ids.length) {
        imageId = ids[0]
      } else if (missing.length) {
        result.missingImages.push({ line: record.line, slug, file: row.image })
      }
    }

    // Пустая ячейка приходит из CSV как '' (toTable), не как undefined —
    // trimmed.optional() пропускает и такую строку как валидную. Отфильтровать
    // явно, иначе '' ?? fallback ничего не даёт (пустая строка — не nullish).
    const title = row.title || undefined

    const existing = await payload.find({
      collection: 'notes',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      req: req as PayloadRequest,
    })
    const current = existing.docs[0]

    if (current) {
      result.updated.push(slug)
      if (dryRun) continue

      const flatData: Record<string, unknown> = {}
      // Пустой title при обновлении не затирает уже стоящее название.
      if (title) flatData.title = title
      if (row.group) flatData.group = row.group
      if (imageId !== undefined) flatData.image = imageId
      if (Object.keys(flatData).length) {
        await payload.update({
          collection: 'notes',
          id: current.id,
          data: flatData as never,
          req: req as PayloadRequest,
        })
      }
    } else {
      // title обязателен для НОВОЙ ноты — в отличие от авто-создания при
      // товарном импорте (relations.ts, там titleFromSlug — единственный
      // источник названия), здесь дизайнер заполняет словарь целенаправленно,
      // отсутствие title в новой строке — опечатка/недосмотр, а не штатный
      // случай, поэтому строка отклоняется явной ошибкой.
      if (!title) {
        result.errors.push({
          line: record.line,
          message: `title: обязателен для новой ноты (slug «${slug}» не найден в базе)`,
        })
        continue
      }

      result.created.push(slug)
      if (dryRun) continue

      await payload.create({
        collection: 'notes',
        data: {
          slug,
          title,
          needsReview: true,
          ...(row.group ? { group: row.group } : {}),
          ...(imageId !== undefined ? { image: imageId } : {}),
        } as never,
        req: req as PayloadRequest,
      })
    }
  }

  // ok остаётся true даже при построчных ошибках — в отличие от товарного
  // CSV (engine.ts, «всё или ничего») здесь ошибка одной строки не откатывает
  // остальные; ok=false только при полном провале (файл без строк, см. выше).
  return result
}
