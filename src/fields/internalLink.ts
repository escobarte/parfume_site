import type { Field } from 'payload'
import { LINK_TARGETS } from '@/lib/links'

// Подписи опций — захардкоженный русский (как везде в admin-конфигах этого
// проекта, см. CLAUDE.md: у Payload своя i18n, не связанная с next-intl).
const TARGET_LABELS: Record<(typeof LINK_TARGETS)[number], string> = {
  home: 'Главная',
  catalog: 'Каталог',
  catalogDiscounted: 'Каталог со скидками',
  brands: 'Бренды',
  about: 'О нас',
  delivery: 'Доставка',
  contacts: 'Контакты',
}

/**
 * Select + override для внутренних ссылок промо-баннера/hero (фаза 4.5,
 * правка п.3) — вместо свободного текстового Link Href. `targetName` задаёт
 * имя select-поля (напр. 'linkTarget' / 'ctaTarget'), override получает то
 * же имя с суффиксом Override. Override, если заполнен, побеждает select —
 * нужен для внешних URL (см. resolveLinkHref в '@/lib/links').
 */
export function internalLinkFields(targetName: string, opts?: { widthTarget?: string }): Field[] {
  return [
    {
      name: targetName,
      type: 'select',
      label: 'Ссылка ведёт на',
      options: LINK_TARGETS.map((value) => ({ value, label: TARGET_LABELS[value] })),
      admin: {
        width: opts?.widthTarget ?? '50%',
        description: 'Куда ведёт ссылка. «О нас», «Доставка», «Контакты», «Бренды» — страницы фазы 5.',
      },
    },
    {
      name: `${targetName}Override`,
      type: 'text',
      label: 'Своя ссылка (необязательно)',
      admin: {
        width: '50%',
        description:
          'Заполнено — используется вместо выбора слева (внешний URL или внутренний путь без префикса локали, напр. /catalog).',
      },
    },
  ]
}
