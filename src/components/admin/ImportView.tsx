import { DefaultTemplate } from '@payloadcms/next/templates'
import { isAdmin } from '@/access/roles'
import { ImportForm } from './ImportForm'

/**
 * Экран «Импорт каталога (CSV)» — /admin/catalog-import (задача 2 фазы 8.1).
 * Раньше импорт был возможен только терминалом контейнера
 * (`./node_modules/.bin/tsx scripts/import.ts`, см. docs/GOTCHAS.md) —
 * клиент физически не мог обновить каталог сам.
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
          <h1 style={{ marginBottom: 'calc(var(--base) / 2)' }}>Импорт каталога (CSV)</h1>
          <p style={{ color: 'var(--theme-elevation-600)', marginBottom: 'var(--base)' }}>
            Формат файла (товары формата A/B, лёгкий прайс <code>sku,price,stock</code>, переводы)
            определяется автоматически по заголовку — тем же движком, что и CLI (
            <code>pnpm import</code>), выбирать формат вручную не нужно.
          </p>
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
