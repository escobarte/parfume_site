import type { GlobalConfig } from 'payload'
import { adminOnly, isAdmin, publicRead } from '@/access/roles'
import { revalidateCatalog } from '@/lib/revalidate'

/**
 * Главная страница — состав секций по docs/WIREFRAMES.md §Главная
 * (мокап docs/mockups/home.html). Порядок секций в вёрстке фиксирован,
 * из админки управляется наполнение.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'Главная страница',
  admin: { group: 'Контент', hidden: ({ user }) => !isAdmin(user) },
  access: { read: publicRead, update: adminOnly },
  hooks: { afterChange: [() => revalidateCatalog('homepage')] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Hero',
          fields: [
            {
              name: 'hero',
              type: 'group',
              fields: [
                {
                  name: 'eyebrow',
                  type: 'text',
                  defaultValue: 'Perfumes for everyone',
                  admin: { description: 'Фирменная EN-фраза — не переводится.' },
                },
                {
                  name: 'title',
                  type: 'text',
                  required: true,
                  localized: true,
                  defaultValue: 'Find your signature.',
                  admin: { description: 'Фирменные EN-фразы оставляйте на английском.' },
                },
                { name: 'subtitle', type: 'textarea', localized: true },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'ctaLabel',
                      type: 'text',
                      localized: true,
                      admin: { width: '50%' },
                    },
                    {
                      name: 'ctaHref',
                      type: 'text',
                      defaultValue: '/catalog',
                      admin: { width: '50%', description: 'Без префикса локали.' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Категории',
          fields: [
            {
              name: 'categoryTiles',
              type: 'array',
              label: 'Плитки категорий',
              maxRows: 4,
              admin: { description: 'Четыре плитки; счётчики товаров считаются из БД.' },
              fields: [
                {
                  name: 'category',
                  type: 'relationship',
                  relationTo: 'categories',
                  required: true,
                },
                {
                  name: 'labelOverride',
                  type: 'text',
                  localized: true,
                  admin: { description: 'Пусто — берётся название категории.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Товарные ряды',
          fields: [
            {
              name: 'newRow',
              type: 'group',
              label: 'Новинки',
              fields: [
                { name: 'title', type: 'text', localized: true, defaultValue: 'Новинки' },
                { name: 'linkLabel', type: 'text', localized: true },
                { name: 'limit', type: 'number', defaultValue: 4, min: 2, max: 12 },
              ],
            },
            {
              name: 'hitsRow',
              type: 'group',
              label: 'Хиты (опциональный слот)',
              admin: { description: 'WIREFRAMES.md §Опциональный слот — по умолчанию выключен.' },
              fields: [
                { name: 'enabled', type: 'checkbox', defaultValue: false },
                { name: 'title', type: 'text', localized: true, defaultValue: 'Хиты' },
                { name: 'linkLabel', type: 'text', localized: true },
                { name: 'limit', type: 'number', defaultValue: 4, min: 2, max: 12 },
              ],
            },
          ],
        },
        {
          label: 'Editorial',
          fields: [
            {
              name: 'editorial',
              type: 'group',
              label: 'Editorial-блок (1 image + 1 phrase + logo)',
              fields: [
                {
                  name: 'phrase',
                  type: 'text',
                  localized: true,
                  defaultValue: 'A scent for every story.',
                  admin: { description: 'Фирменная EN-фраза — не переводится.' },
                },
                { name: 'text', type: 'textarea', localized: true },
                {
                  type: 'row',
                  fields: [
                    { name: 'linkLabel', type: 'text', localized: true, admin: { width: '50%' } },
                    { name: 'linkHref', type: 'text', admin: { width: '50%' } },
                  ],
                },
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  admin: { description: 'Пусто — на плите cream остаётся знак бренда.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Бренд-строка',
          fields: [
            {
              name: 'featuredBrands',
              type: 'relationship',
              relationTo: 'brands',
              hasMany: true,
              admin: { description: 'Одна центрированная строка названий без логотипов.' },
            },
          ],
        },
      ],
    },
  ],
}
