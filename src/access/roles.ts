import type { Access, FieldAccess, PayloadRequest } from 'payload'
import type { User } from '@/payload-types'

/**
 * Роли проекта (PLAN.md §4.1, §4.3):
 * - admin   — всё;
 * - manager — рабочее место по заказам: товары и справочники только на чтение,
 *             заказы — полный цикл, настройки и пользователи недоступны.
 */
export type Role = NonNullable<User['role']>

const roleOf = (user: unknown): Role | undefined =>
  (user as { role?: Role } | null | undefined)?.role

export const isAdmin = (user: unknown): boolean => roleOf(user) === 'admin'
export const isManager = (user: unknown): boolean => roleOf(user) === 'manager'
export const isStaff = (user: unknown): boolean => isAdmin(user) || isManager(user)

/** Только админ. */
export const adminOnly: Access = ({ req: { user } }) => isAdmin(user)

/** Админ и менеджер (например, чтение товаров в админке). */
export const staffOnly: Access = ({ req: { user } }) => isStaff(user)

/** Публичное чтение справочников. */
export const publicRead: Access = () => true

/** Поле правит только админ (например, роль пользователя). */
export const adminFieldOnly: FieldAccess = ({ req: { user } }) => isAdmin(user)

/** Доступ в саму админ-панель — обеим ролям (тут допустим только boolean). */
export const canAccessAdminPanel = ({ req: { user } }: { req: PayloadRequest }): boolean =>
  isStaff(user)
