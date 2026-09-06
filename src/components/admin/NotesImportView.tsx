import { DefaultTemplate } from '@payloadcms/next/templates'
import { isAdmin } from '@/access/roles'
import { MediaImportForm } from './MediaImportForm'
import { NotesImportForm } from './NotesImportForm'

/**
 * Экран «Словарь нот» — /admin/notes-import (ПРОМПТ 12 v2, задача 2).
 * Отдельно от «Импорт каталога» (владелец явно просил не смешивать ноты с
 * товарами — свой пункт меню). Тот же паттерн, что ImportView.tsx: шаг 1 —
 * архив иконок (MediaImportForm переиспользован как есть, эндпоинт общий
 * для любых картинок), шаг 2 — CSV словаря (NotesImportForm, свой эндпоинт
 * /api/notes-import).
 *
 * Обёрнут в DefaultTemplate вручную — та же причина, что у ImportView.tsx:
 * кастомные top-level views не получают templateType от Payload сами.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NotesImportView(props: any) {
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
          <h1 style={{ marginBottom: 'calc(var(--base) / 2)' }}>Словарь нот</h1>
          <p style={{ color: 'var(--theme-elevation-600)', marginBottom: 'var(--base)' }}>
            Массовая загрузка нот партиями (иконка + название на трёх языках). Не влияет на прайс
            товаров — та же коллекция «Ноты», что уже используется в пирамиде на странице товара и
            заводится автоматически при импорте прайса.
          </p>

          <h2 style={{ marginBottom: '.5rem', fontSize: '1rem' }}>Шаг 1 — иконки нот (ZIP)</h2>
          <p style={{ color: 'var(--theme-elevation-600)', marginBottom: 'var(--base)' }}>
            Тот же архив, что и для фото товаров — имя файла = <code>slug</code> ноты
            (<code>amber.png</code>).
          </p>
          <MediaImportForm />

          <hr
            style={{
              margin: '2rem 0',
              border: 'none',
              borderTop: '1px solid var(--theme-elevation-150)',
            }}
          />

          <h2 style={{ marginBottom: '.5rem', fontSize: '1rem' }}>Шаг 2 — CSV словарь нот</h2>
          <NotesImportForm />
        </div>
      ) : (
        <div style={{ padding: 'var(--base)' }}>
          <p>Доступ только для администратора.</p>
        </div>
      )}
    </DefaultTemplate>
  )
}
