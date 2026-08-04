import type { CollectionConfig } from 'payload'
import { adminFieldOnly, adminOnly, canAccessAdminPanel, isAdmin } from '@/access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Пользователь', plural: 'Пользователи' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role', 'updatedAt'],
    group: 'Система',
    // Менеджер не должен видеть раздел пользователей вовсе.
    hidden: ({ user }) => !isAdmin(user),
  },
  auth: true,
  access: {
    admin: canAccessAdminPanel,
    create: adminOnly,
    delete: adminOnly,
    // Менеджер видит и правит только собственную запись (имя, пароль).
    read: ({ req: { user } }) =>
      isAdmin(user) ? true : user ? { id: { equals: user.id } } : false,
    update: ({ req: { user } }) =>
      isAdmin(user) ? true : user ? { id: { equals: user.id } } : false,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // Первый пользователь системы обязан быть админом, иначе панель запрётся.
        if (operation === 'create' && !data.role) {
          const { totalDocs } = await req.payload.count({ collection: 'users' })
          data.role = totalDocs === 0 ? 'admin' : 'manager'
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'manager',
      index: true,
      saveToJWT: true,
      access: { update: adminFieldOnly },
      admin: { description: 'Менеджер: товары только на чтение, заказы — полностью.' },
      options: [
        { label: 'Администратор', value: 'admin' },
        { label: 'Менеджер', value: 'manager' },
      ],
    },
  ],
}
