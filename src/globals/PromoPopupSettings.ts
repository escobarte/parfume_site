import type { GlobalConfig } from 'payload'
import { adminOnly, isAdmin, publicRead } from '@/access/roles'
import { GLOBALS_TAG, revalidateCatalog } from '@/lib/revalidate'

/**
 * Настройки попапа «первая скидка» (2026-09-11, редизайн 2026-09-19). Через
 * глобал меняются КАРТИНКИ и ТЕКСТЫ — раскладка попапа статична в коде
 * (`src/components/promo/PromoPopup*.tsx`), по макету дизайнера.
 *
 * Все тексты и обе картинки локализованы, и **пустое поле в локали — не
 * ошибка**: значение берётся по цепочке «текущая локаль → ro → ru → en →
 * стандартная строка из `messages/<locale>.json`» (резолвер —
 * `src/lib/content/promoPopup.ts`). Поэтому заполнить один язык достаточно:
 * он применится ко всем, остальные можно добавить позже. Встроенный фолбэк
 * Payload так не умеет — он подставляет только дефолтную локаль (ro).
 */

/** Одна и та же подсказка у всех локализованных текстов — правило цепочки локалей. */
const LOCALE_HINT =
  'Если оставить пустым — показывается текст из румынской версии (или из первой заполненной).'

/** Подсказка про метку процента. Значение берётся из поля «Процент скидки». */
const PERCENT_HINT = 'Метка {percent} заменяется на значение поля «Процент скидки» (например, 15%).'

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
        description:
          'Процент, который записывается в выданный промокод и подставляется вместо метки {percent} в текстах. На картинке процент вшит дизайнером и отсюда НЕ меняется.',
      },
    },
    {
      name: 'requirePhone',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar', description: 'Делать телефон обязательным полем формы.' },
    },
    {
      /*
       * Безымянная группа — только рамка в админке: данные остаются плоскими
       * (`image`, `imageAlt`, …), поэтому существующие пути полей не меняются
       * и миграция данных не нужна. Тот же приём, что у баннеров главной.
       */
      type: 'group',
      label: 'Картинки',
      admin: {
        description:
          'Обе необязательные. Картинок нет ни на одном языке — попап показывается в прежнем виде, с тёмной шапкой и знаком бренда, ничего не ломается. ВАЖНО: процент на картинке вшит дизайнером и не связан с полем «Процент скидки» — при смене процента картинку нужно перезагрузить.',
      },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          localized: true,
          label: 'Десктоп — экраны от 768 px',
          admin: {
            description: `Левая колонка попапа, на всю его высоту. Рекомендуемый размер 840×1200 (вертикальная, 7:10). Высоту колонки задаёт форма справа, поэтому на разных экранах кадр обрезается по центру то сверху-снизу, то с боков (10–15%) — логотип, процент и флакон держите в центральной части, к краям важное не ставьте. ${LOCALE_HINT}`,
          },
        },
        {
          name: 'imageAlt',
          type: 'text',
          localized: true,
          label: 'Описание картинки (десктоп)',
          admin: {
            description: `Для скринридеров и на случай, если картинка не загрузилась. Пусто — возьмётся описание из медиатеки. ${LOCALE_HINT}`,
          },
        },
        {
          name: 'imageMobile',
          type: 'upload',
          relationTo: 'media',
          localized: true,
          label: 'Мобильный — до 767 px',
          admin: {
            description: `Полоса сверху попапа вместо тёмной шапки. Рекомендуемый размер 1000×540 (горизонтальная, ~1.85:1) — это ровно пропорция полосы, такой кадр не обрезается. Пусто на всех языках — на телефоне показывается десктопная, обрезанная по центру. ${LOCALE_HINT}`,
          },
        },
        {
          name: 'imageMobileAlt',
          type: 'text',
          localized: true,
          label: 'Описание картинки (мобильный)',
          admin: {
            description: `Пусто — возьмётся описание из медиатеки. ${LOCALE_HINT}`,
          },
        },
      ],
    },
    {
      type: 'group',
      label: 'Тексты',
      admin: {
        description:
          'Все поля необязательные: пустое — это стандартный текст сайта на нужном языке. На телефоне показываются только кнопка и подпись под ней — заголовок, подзаголовок и описание там скрыты, их место занимает картинка.',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          localized: true,
          label: 'Заголовок',
          admin: {
            description: `Крупная надпись справа («WELCOME TO MON FLACON»). Выводится заглавными автоматически. ${LOCALE_HINT}`,
          },
        },
        {
          name: 'subtitle',
          type: 'text',
          localized: true,
          label: 'Подзаголовок',
          admin: {
            description: `Короткая фраза под чертой («Your scent starts here.»). ${LOCALE_HINT}`,
          },
        },
        {
          name: 'description',
          type: 'text',
          localized: true,
          label: 'Описание',
          admin: {
            description: `Одно-два предложения над формой. ${PERCENT_HINT} Процент в этом тексте выделяется жирным. ${LOCALE_HINT}`,
          },
        },
        {
          name: 'buttonLabel',
          type: 'text',
          localized: true,
          label: 'Надпись на кнопке',
          admin: {
            description: `Например «Unlock my {percent}». ${PERCENT_HINT} ${LOCALE_HINT}`,
          },
        },
        {
          name: 'footerText',
          type: 'text',
          localized: true,
          label: 'Подпись под кнопкой',
          admin: {
            description: `Мелкий текст в самом низу. ${LOCALE_HINT}`,
          },
        },
      ],
    },
  ],
}
