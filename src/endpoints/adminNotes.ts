import type { Endpoint, PayloadRequest } from 'payload'
import { isAdmin } from '@/access/roles'
import { applyNotesImport, type NotesImportResult } from '@/lib/import/applyNotes'
import { list } from '@/lib/import/format'

// Словарь нот — сотни строк за раз (первый пакет владельца — 150), но это
// маленький CSV (6 коротких колонок), лимит с запасом, тот же порядок
// величины, что у /api/catalog-import.
const MAX_FILE_BYTES = 10 * 1024 * 1024

const forbidden = () => new Response('Forbidden', { status: 403 })

const badRequest = (message: string) => Response.json({ ok: false, reportText: message }, { status: 400 })

function formatNotesReport(result: NotesImportResult): string {
  const lines: string[] = []
  lines.push(`Создано новых нот: ${result.created.length}${result.created.length ? ` — ${list(result.created)}` : ''}`)
  lines.push(`Обновлено существующих: ${result.updated.length}${result.updated.length ? ` — ${list(result.updated)}` : ''}`)

  if (result.missingImages.length) {
    lines.push(`Иконка не найдена (нота сохранена без неё): ${result.missingImages.length}`)
    for (const item of result.missingImages.slice(0, 50)) {
      lines.push(`  строка ${item.line} (${item.slug}): файл «${item.file}» не найден — загрузите его архивом (шаг 1)`)
    }
    if (result.missingImages.length > 50) lines.push(`  … и ещё ${result.missingImages.length - 50}`)
  }

  if (result.errors.length) {
    lines.push(`Строк с ошибкой (пропущены): ${result.errors.length}`)
    for (const error of result.errors.slice(0, 50)) {
      lines.push(`  строка ${error.line}: ${error.message}`)
    }
    if (result.errors.length > 50) lines.push(`  … и ещё ${result.errors.length - 50}`)
  }

  return lines.join('\n')
}

/**
 * Массовый импорт словаря нот — /admin/notes-import (ПРОМПТ 12 v2, задача 2).
 * Отдельный от /api/catalog-import экран и эндпоинт: словарь нот наполняется
 * партиями по мере готовности иконок дизайнера, независимо от прайса товаров.
 * Иконки — тем же архивом, что и фото товаров (/api/media-import, не второй
 * ZIP-обработчик). Построчная терпимость (не транзакция «всё или ничего») —
 * см. комментарий в applyNotes.ts.
 */
export const adminNotesEndpoints: Endpoint[] = [
  {
    path: '/notes-import',
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
        return badRequest('ожидался multipart/form-data с файлом CSV')
      }

      const file = form.get('file')
      if (!(file instanceof File) || !file.size) {
        return badRequest('файл CSV не выбран')
      }
      if (file.size > MAX_FILE_BYTES) {
        return badRequest(
          `файл больше ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} МБ — проверь, тот ли файл выбран`,
        )
      }

      const dryRun = form.get('dryRun') === 'true'
      const csvText = await file.text()

      const result = await applyNotesImport(req.payload, csvText, {
        dryRun,
        req: req as PayloadRequest,
      })

      return Response.json({ ...result, reportText: formatNotesReport(result) })
    },
  },
]
