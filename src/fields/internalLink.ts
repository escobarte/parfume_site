import type { Field } from 'payload'
import { LINK_TARGETS, PAGE_BACKED_TARGETS } from '@/lib/links'

// Подписи опций — захардкоженный русский (как везде в admin-конфигах этого
// проекта, см. CLAUDE.md: у Payload своя i18n, не связанная с next-intl).
// Метки сохраняются для ВСЕХ целей LINK_TARGETS, включая уже отданные под
// relationship (about/delivery/contacts) — их продолжает использовать
// resolveLinkHref для прямых литералов в коде (см. src/lib/links.ts).
const TARGET_LABELS: Record<(typeof LINK_TARGETS)[number], string> = {
  home: 'Главная',
  catalog: 'Каталог',
  catalogDiscounted: 'Каталог со скидками',
  catalogNew: 'Каталог с новинками',
  brands: 'Бренды',
  about: 'О нас',
  delivery: 'Доставка',
  contacts: 'Контакты',
  orderLookup: 'Отследить заказ',
}

// Select показывает только системные цели без Pages-документа за ними —
// about/delivery/contacts с фазы 5.2 выбираются через relationship ниже
// (двойной механизм «страница ИЛИ системная цель», PLAN.md §5.2).
const SYSTEM_SELECT_TARGETS = LINK_TARGETS.filter(
  (target) => !(PAGE_BACKED_TARGETS as readonly string[]).includes(target),
)

/**
 * Select/relationship + override для внутренних ссылок промо-баннера/hero/
 * навигации. `targetName` задаёт базовое имя полей: `{targetName}Mode`
 * (radio «системная»/«страница»), `{targetName}` (select системных целей,
 * виден при mode=system), `{targetName}Page` (relationship на `Pages`,
 * виден при mode=page), `{targetName}Override` (текст, всегда побеждает
 * оба выше — внешние URL). Резолвится через resolveInternalLink
 * (см. '@/lib/links').
 */
export function internalLinkFields(targetName: string): Field[] {
  const modeName = `${targetName}Mode`
  const pageName = `${targetName}Page`

  return [
    {
      type: 'row',
      fields: [
        {
          name: modeName,
          type: 'radio',
          label: 'Тип ссылки',
          defaultValue: 'system',
          options: [
            { label: 'Системная цель', value: 'system' },
            { label: 'Страница', value: 'page' },
          ],
          admin: { width: '25%', layout: 'horizontal' },
        },
        {
          name: targetName,
          type: 'select',
          label: 'Ссылка ведёт на',
          options: SYSTEM_SELECT_TARGETS.map((value) => ({ value, label: TARGET_LABELS[value] })),
          admin: {
            width: '37.5%',
            description: 'Каталог, Бренды, Главная и т.п. — не Pages-контент.',
            condition: (_, siblingData) => (siblingData?.[modeName] ?? 'system') === 'system',
          },
        },
        {
          name: pageName,
          type: 'relationship',
          relationTo: 'pages',
          label: 'Страница',
          admin: {
            width: '37.5%',
            description: 'О нас, Доставка, Контакты и другой контент из коллекции Страницы.',
            condition: (_, siblingData) => siblingData?.[modeName] === 'page',
          },
        },
      ],
    },
    {
      name: `${targetName}Override`,
      type: 'text',
      label: 'Своя ссылка (необязательно)',
      admin: {
        description:
          'Заполнено — используется вместо выбора выше (внешний URL или внутренний путь без префикса локали, напр. /catalog).',
      },
    },
  ]
}
