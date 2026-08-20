import Link from 'next/link'
import { isAdmin } from '@/access/roles'

type Props = { user?: { role?: string | null } | null }

/**
 * Пункт «Импорт CSV» в боковой навигации /admin — точка входа на
 * ImportView.tsx (задача 2 фазы 8.1). Только для роли admin: менеджеру
 * раздел не нужен (товары у него и так read-only, см. src/access/roles.ts).
 */
export function ImportNavLink({ user }: Props) {
  if (!isAdmin(user)) return null

  return (
    <Link
      href="/admin/catalog-import"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '.6em',
        padding: 'calc(var(--base) / 4) 0',
        margin: 'calc(var(--base) / 2) 0',
        color: 'var(--theme-elevation-800)',
        textDecoration: 'none',
        fontSize: '.95rem',
      }}
    >
      Импорт CSV
    </Link>
  )
}
