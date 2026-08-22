import { DefaultTemplate } from '@payloadcms/next/templates'
import { isAdmin } from '@/access/roles'
import { ImportForm } from './ImportForm'
import { MediaImportForm } from './MediaImportForm'

/**
 * Экран «Импорт каталога» — /admin/catalog-import (задача 2 фазы 8.1,
 * дополнено загрузкой фото архивом). Раньше импорт был возможен только
 * терминалом контейнера (`./node_modules/.bin/tsx scripts/import.ts`, см.
 * docs/GOTCHAS.md) — клиент физически не мог обновить каталог сам.
 *
 * Два независимых блока сверху вниз — сначала фото (MediaImportForm.tsx,
 * эндпоинт /api/media-import, см. src/endpoints/adminMedia.ts), потом CSV
 * (ImportForm.tsx, /api/catalog-import). Намеренно не одна кнопка: колонка
 * images в CSV ищет уже загруженные файлы по имени (src/lib/import/images.ts),
 * поэтому порядок действий важен, а форма его не может гарантировать сама —
 * отсюда явные подписи «Шаг 1»/«Шаг 2» в тексте экрана.
 *
 * Обёрнут в DefaultTemplate вручную. Кастомные top-level views
 * (admin.components.views) Payload матчит отдельным «catch-all»-путём
 * (getCustomViewByRoute в @payloadcms/next), который не проставляет
 * templateType вовсе — рендер идёт голым Fragment'ом без шапки/сайдбара.
 * Проверено вживую: без этой обёртки экран открывался буквально без единого
 * стиля Payload (обычный браузерный дефолт). DefaultTemplate — тот же
 * компонент и тот же набор пропсов, которым сам Payload оборачивает штатные
 * экраны (см. node_modules/@payloadcms/next/dist/views/NotFound/index.js) —
 * пропсы приходят от Payload уже готовыми, тип props намеренно широкий:
 * это внутренний, не публично типизированный контракт рендер-пайплайна
 * Payload, а не наши собственные данные.
 *
 * Доступ — только роль admin (менеджеру раздел не нужен и не должен быть
 * виден, см. навигацию ImportNavLink.tsx). Проверка роли здесь — вторая
 * линия защиты: реальный запрет уже стоит на самих эндпоинтах
 * (src/endpoints/adminCatalog.ts), эта проверка не пускает менеджера дальше
 * заголовка экрана, даже если он наберёт путь руками.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ImportView(props: any) {
  const { initPageResult, payload, params, searchParams, viewActions } = props ?? {}
  const req = initPageResult?.req
  const user = req?.user

  return (
    <DefaultTemplate
      i18n={req?.i18n}
      locale={initPageResult?.locale}
      params={params}
      payload={payload}
      permissions={initPageResult?.permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      viewActions={viewActions}
      visibleEntities={initPageResult?.visibleEntities}
    >
      {isAdmin(user) ? (
        <div style={{ padding: 'var(--base)', maxWidth: '48rem' }}>
          <h1 style={{ marginBottom: 'calc(var(--base) / 2)' }}>Импорт каталога</h1>
          <p style={{ color: 'var(--theme-elevation-600)', marginBottom: 'var(--base)' }}>
            Загрузка каталога из файла. Если у товаров есть фото — сначала загрузите архив с ними
            (шаг 1), затем CSV (шаг 2). Формат файла программа определит сама. Начните с кнопки
            «Проверить» — она ничего не меняет в каталоге, только показывает, что произойдёт.
          </p>

          <h2 style={{ marginBottom: '.5rem', fontSize: '1rem' }}>Шаг 1 — фото товаров (ZIP)</h2>
          <p style={{ color: 'var(--theme-elevation-600)', marginBottom: 'var(--base)' }}>
            Загрузи архив с фото ПЕРЕД импортом CSV, если он ссылается на новые файлы колонкой{' '}
            <code>images</code> — два независимых действия, не одна кнопка.
          </p>
          <MediaImportForm />

          <hr
            style={{
              margin: '2rem 0',
              border: 'none',
              borderTop: '1px solid var(--theme-elevation-150)',
            }}
          />

          <h2 style={{ marginBottom: '.5rem', fontSize: '1rem' }}>Шаг 2 — CSV</h2>
          <ImportForm />
        </div>
      ) : (
        <div style={{ padding: 'var(--base)' }}>
          <p>Доступ только для администратора.</p>
        </div>
      )}
    </DefaultTemplate>
  )
}
