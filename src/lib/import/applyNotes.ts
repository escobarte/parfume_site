import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'
import { slugify } from '@/lib/slugify'
import { toTable } from './csv'
import { ImageResolver } from './images'

const trimmed = z.string().trim()

/** Одна строка словаря нот — /admin/notes-import (ПРОМПТ 12 v2, задача 2). */
const noteRow = z.object({
  slug: trimmed.min(1, 'slug: обязателен'),
  name_ro: trimmed.optional(),
  name_ru: trimmed.optional(),
  name_en: trimmed.optional(),
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

/** Из slug делаем человекочитаемое название на случай отсутствия перевода. */
const titleFromSlug = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const NOTE_LOCALES = ['ro', 'ru', 'en'] as const
type NoteLocale = (typeof NOTE_LOCALES)[number]

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
    const names: Partial<Record<NoteLocale, string>> = {
      ro: row.name_ro || undefined,
      ru: row.name_ru || undefined,
      en: row.name_en || undefined,
    }

    const existing = await payload.find({
      collection: 'notes',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      locale: 'ro',
      req: req as PayloadRequest,
    })
    const current = existing.docs[0]

    if (current) {
      result.updated.push(slug)
      if (dryRun) continue

      const flatData: Record<string, unknown> = {}
      if (row.group) flatData.group = row.group
      if (imageId !== undefined) flatData.image = imageId
      if (Object.keys(flatData).length) {
        await payload.update({
          collection: 'notes',
          id: current.id,
          locale: 'ro',
          data: flatData as never,
          req: req as PayloadRequest,
        })
      }

      for (const locale of NOTE_LOCALES) {
        const name = names[locale]
        if (!name) continue
        await payload.update({
          collection: 'notes',
          id: current.id,
          locale,
          data: { title: name } as never,
          req: req as PayloadRequest,
        })
      }
    } else {
      result.created.push(slug)
      if (dryRun) continue

      const fallbackTitle = names.ro ?? names.en ?? names.ru ?? titleFromSlug(slug)
      const created = await payload.create({
        collection: 'notes',
        locale: 'ro',
        data: {
          slug,
          title: fallbackTitle,
          needsReview: true,
          ...(row.group ? { group: row.group } : {}),
          ...(imageId !== undefined ? { image: imageId } : {}),
        } as never,
        req: req as PayloadRequest,
      })

      for (const locale of NOTE_LOCALES.filter((l) => l !== 'ro')) {
        await payload.update({
          collection: 'notes',
          id: created.id,
          locale,
          data: { title: names[locale] ?? fallbackTitle } as never,
          req: req as PayloadRequest,
        })
      }
    }
  }

  // ok остаётся true даже при построчных ошибках — в отличие от товарного
  // CSV (engine.ts, «всё или ничего») здесь ошибка одной строки не откатывает
  // остальные; ok=false только при полном провале (файл без строк, см. выше).
  return result
}
