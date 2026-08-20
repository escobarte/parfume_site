import type { Endpoint } from 'payload'
import { isAdmin } from '@/access/roles'
import { runImport } from '@/lib/import/engine'
import { formatReport } from '@/lib/import/report'
import { revalidateAll } from '@/lib/revalidate'

// С запасом на реальный прайс (сотни товаров), но защита от случайно
// выбранного не того файла — реальные CSV прайса весят десятки-сотни КБ.
const MAX_FILE_BYTES = 10 * 1024 * 1024

const forbidden = () => new Response('Forbidden', { status: 403 })

const badRequest = (message: string) =>
  Response.json(
    { ok: false, dryRun: false, errors: [{ line: 0, message }], reportText: message },
    { status: 400 },
  )

/**
 * Экранные операции админки поверх готового движка импорта (src/lib/import/) —
 * тот же `runImport`, что и CLI `scripts/import.ts`, не второй парсер (см.
 * промпт задачи 2 фазы 8.1). Формат файла (товары A/B, лёгкий прайс, переводы)
 * определяется автоматически по заголовку — так уже делает движок, отдельный
 * выбор формата в UI не нужен.
 *
 * Файл читается из multipart-запроса напрямую в память (`file.text()`) — на
 * диск не пишется вообще, поэтому ограничение non-root окружения на запись
 * под /app (см. docs/GOTCHAS.md) этот путь не задевает.
 *
 * Пути — вне `/api/<slug-коллекции>` (docs/GOTCHAS.md, «Роуты и API») и вне
 * пространства коллекций вообще: импорт затрагивает сразу products/brands/
 * categories/notes, ни к одной коллекции персонально не привязан.
 */
export const adminCatalogEndpoints: Endpoint[] = [
  {
    path: '/catalog-import',
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
      const localeRaw = form.get('locale')
      const locale = typeof localeRaw === 'string' && localeRaw ? localeRaw : undefined

      const csvText = await file.text()
      const result = await runImport(req.payload, csvText, { dryRun, locale })
      const reportText = formatReport(result)

      if (!dryRun && result.ok) {
        // Явная гарантия сброса кэша сразу после реального импорта — этот
        // хендлер выполняется внутри живого Next-процесса (не CLI-скриптом),
        // поэтому afterChange-хуки затронутых коллекций (Products/Brands/…)
        // и так уже сбросили свои теги через revalidateCatalog/revalidateTaxonomy
        // (см. src/lib/revalidate.ts) — но явный revalidateAll() не полагается
        // на то, какие именно коллекции затронул конкретный формат файла, и
        // сбрасывает вообще все теги витрины разом, гарантированно.
        await revalidateAll()
      }

      return Response.json({ ...result, reportText })
    },
  },
  {
    // Ручной сброс кэша витрины — для случаев, которые НЕ проходят через
    // живой Next-запрос и поэтому не задевают afterChange-хуки: CLI-импорт
    // (`./node_modules/.bin/tsx scripts/import.ts` в терминале контейнера),
    // `pnpm seed`, прямая правка БД. См. docs/GOTCHAS.md «CLI не сбрасывает
    // кэш витрины» — до этой кнопки обходной путь был «открыть товар →
    // Сохранить» в /admin.
    path: '/catalog-revalidate',
    method: 'post',
    handler: async (req) => {
      if (!isAdmin(req.user)) return forbidden()
      await revalidateAll()
      return Response.json({ ok: true, at: new Date().toISOString() })
    },
  },
]
