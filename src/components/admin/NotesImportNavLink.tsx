import Link from 'next/link'
import { isAdmin } from '@/access/roles'

type Props = { user?: { role?: string | null } | null }

/**
 * Пункт «Словарь нот» в боковой навигации /admin — точка входа на
 * NotesImportView.tsx. Отдельно от «Импорт каталога» (ImportNavLink.tsx) по
 * прямому решению владельца — ноты не товары, свой пункт меню. Только для
 * роли admin, тем же принципом, что и остальные экраны импорта.
 */
export function NotesImportNavLink({ user }: Props) {
  if (!isAdmin(user)) return null

  return (
    <Link
      href="/admin/notes-import"
      className="admin-nav-accent"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '.6em',
        margin: 'calc(var(--base) / 2) 0',
        textDecoration: 'none',
      }}
    >
      Словарь нот
    </Link>
  )
}
