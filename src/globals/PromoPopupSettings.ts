import type { GlobalConfig } from 'payload'
import { adminOnly, isAdmin, publicRead } from '@/access/roles'
import { GLOBALS_TAG, revalidateCatalog } from '@/lib/revalidate'

/**
 * Настройки попапа «первая скидка» (2026-09-11). Через глобал меняется только
 * КОНТЕНТ — вёрстка и раскладка попапа статичны в коде
 * (`src/components/promo/PromoPopup*.tsx`), по мокапу владельца.
 *
 * `title` и `footerText` локализованы: у сайта три локали, а тексты попапа
 * видит покупатель. Пустое поле в локали — не ошибка: попап подставит
 * дефолтную строку из `messages/<locale>.json` (namespace `PromoPopup`),
 * так что незаполненный глобал даёт рабочий попап на всех трёх языках.
 */
export const PromoPopupSettings: GlobalConfig = {
  slug: 'promo-popup-settings',
  label: 'Попап «первая скидка»',
  admin: { group: 'Контент', hidden: ({ user }) => !isAdmin(user) },
  access: { read: publicRead, update: adminOnly },
  hooks: { afterChange: [() => revalidateCatalog(GLOBALS_TAG)] },
  fields: [
    {
      name: 'isEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Показывать попап на сайте. Выключено по умолчанию — включайте, когда тексты и процент проверены.',
      },
    },
    {
      name: 'discountPercent',
      type: 'number',
      required: true,
      min: 1,
      max: 100,
      defaultValue: 15,
      admin: {
        position: 'sidebar',
        description: 'Процент, который показывается в попапе И записывается в выданный промокод.',
      },
    },
    {
      name: 'requirePhone',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar', description: 'Делать телефон обязательным полем формы.' },
    },
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: { description: 'Заголовок над процентом. Пусто — возьмётся стандартный текст локали.' },
    },
    {
      name: 'footerText',
      type: 'text',
      localized: true,
      admin: { description: 'Подпись под кнопкой. Пусто — возьмётся стандартный текст локали.' },
    },
  ],
}
