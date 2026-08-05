/**
 * Демо-данные фазы 2 (PLAN.md §4.2): 3 бренда, 4 категории, 10 нот, 10 товаров.
 * Тексты — демонстрационные, на трёх локалях; заменяются реальным прайсом клиента
 * через CSV-импорт. Категорий четыре, а не три: столько плиток требует
 * docs/WIREFRAMES.md §2 (Она / Он / Унисекс / Наборы).
 */

export type Locales = { ro: string; ru: string; en: string }

export type SeedBrand = {
  slug: string
  title: string
  country: Locales
  description: Locales
  isFeatured: boolean
}

export type SeedCategory = {
  slug: string
  title: Locales
  description: Locales
  order: number
}

export type SeedNote = {
  slug: string
  title: Locales
  group: 'citrus' | 'floral' | 'woody' | 'spicy' | 'sweet' | 'fresh' | 'animalic'
}

export type SeedProduct = {
  handle: string
  slug: string
  title: string
  brand: string
  categories: string[]
  gender: 'female' | 'male' | 'unisex'
  family: 'floral' | 'woody' | 'oriental' | 'fresh' | 'fougere' | 'chypre'
  notes: string[]
  pyramid: { top: string[]; heart: string[]; base: string[] }
  description: Locales
  variants: { volume: number; sku: string; price: number; oldPrice?: number; stock: number }[]
  isNew?: boolean
  isHit?: boolean
  isSale?: boolean
}

export const brands: SeedBrand[] = [
  {
    slug: 'maison-orphee',
    title: 'Maison Orphée',
    country: { ro: 'Franța', ru: 'Франция', en: 'France' },
    description: {
      ro: 'Casă pariziană de nișă: compoziții liniștite, construite în jurul unei singure idei.',
      ru: 'Парижский нишевый дом: спокойные композиции вокруг одной идеи.',
      en: 'A Parisian niche house: quiet compositions built around a single idea.',
    },
    isFeatured: true,
  },
  {
    slug: 'nord-atelier',
    title: 'Nord Atelier',
    country: { ro: 'Suedia', ru: 'Швеция', en: 'Sweden' },
    description: {
      ro: 'Atelier scandinav: minimalism, lemn deschis și aer rece.',
      ru: 'Скандинавская мастерская: минимализм, светлое дерево и холодный воздух.',
      en: 'A Scandinavian studio: minimalism, pale wood and cold air.',
    },
    isFeatured: true,
  },
  {
    slug: 'casa-lumina',
    title: 'Casa Lumina',
    country: { ro: 'România', ru: 'Румыния', en: 'Romania' },
    description: {
      ro: 'Marcă regională: ingrediente locale, texturi calde, prețuri accesibile.',
      ru: 'Региональная марка: локальные ингредиенты, тёплые фактуры, доступные цены.',
      en: 'A regional label: local ingredients, warm textures, accessible prices.',
    },
    isFeatured: true,
  },
]

export const categories: SeedCategory[] = [
  {
    slug: 'femei',
    title: { ro: 'Ea', ru: 'Она', en: 'For her' },
    description: {
      ro: 'Compoziții florale, pudrate și luminoase.',
      ru: 'Цветочные, пудровые и светлые композиции.',
      en: 'Floral, powdery and luminous compositions.',
    },
    order: 1,
  },
  {
    slug: 'barbati',
    title: { ro: 'El', ru: 'Он', en: 'For him' },
    description: {
      ro: 'Lemn, condimente și piele — structuri clare.',
      ru: 'Дерево, специи и кожа — ясные структуры.',
      en: 'Wood, spice and leather — clear structures.',
    },
    order: 2,
  },
  {
    slug: 'unisex',
    title: { ro: 'Unisex', ru: 'Унисекс', en: 'Unisex' },
    description: {
      ro: 'Arome fără gen: contează caracterul, nu eticheta.',
      ru: 'Ароматы вне гендера: важен характер, а не ярлык.',
      en: 'Scents beyond gender: character over label.',
    },
    order: 3,
  },
  {
    slug: 'seturi',
    title: { ro: 'Seturi', ru: 'Наборы', en: 'Sets' },
    description: {
      ro: 'Seturi de descoperire și cadouri gata pregătite.',
      ru: 'Наборы для знакомства и готовые подарки.',
      en: 'Discovery sets and ready-made gifts.',
    },
    order: 4,
  },
]

export const notes: SeedNote[] = [
  {
    slug: 'bergamota',
    title: { ro: 'Bergamotă', ru: 'Бергамот', en: 'Bergamot' },
    group: 'citrus',
  },
  { slug: 'lamaie', title: { ro: 'Lămâie', ru: 'Лимон', en: 'Lemon' }, group: 'citrus' },
  { slug: 'iasomie', title: { ro: 'Iasomie', ru: 'Жасмин', en: 'Jasmine' }, group: 'floral' },
  { slug: 'trandafir', title: { ro: 'Trandafir', ru: 'Роза', en: 'Rose' }, group: 'floral' },
  { slug: 'iris', title: { ro: 'Iris', ru: 'Ирис', en: 'Iris' }, group: 'floral' },
  {
    slug: 'santal',
    title: { ro: 'Lemn de santal', ru: 'Сандал', en: 'Sandalwood' },
    group: 'woody',
  },
  { slug: 'cedru', title: { ro: 'Cedru', ru: 'Кедр', en: 'Cedar' }, group: 'woody' },
  {
    slug: 'piper-negru',
    title: { ro: 'Piper negru', ru: 'Чёрный перец', en: 'Black pepper' },
    group: 'spicy',
  },
  { slug: 'vanilie', title: { ro: 'Vanilie', ru: 'Ваниль', en: 'Vanilla' }, group: 'sweet' },
  { slug: 'mosc', title: { ro: 'Mosc', ru: 'Мускус', en: 'Musk' }, group: 'animalic' },
]

const v = (sku: string, prices: [number, number, number], stock: [number, number, number]) => [
  { volume: 5, sku: `${sku}-05`, price: prices[0], stock: stock[0] },
  { volume: 10, sku: `${sku}-10`, price: prices[1], stock: stock[1] },
  { volume: 30, sku: `${sku}-30`, price: prices[2], stock: stock[2] },
]

export const products: SeedProduct[] = [
  {
    handle: 'MO-SIGNATURE-WOOD',
    slug: 'maison-orphee-signature-wood',
    title: 'Signature Wood',
    brand: 'maison-orphee',
    categories: ['unisex'],
    gender: 'unisex',
    family: 'woody',
    notes: ['bergamota', 'santal', 'cedru'],
    pyramid: { top: ['bergamota'], heart: ['cedru'], base: ['santal'] },
    description: {
      ro: 'Lemn cald și bergamotă limpede: un parfum liniștit pentru zilele lungi.',
      ru: 'Тёплое дерево и прозрачный бергамот: спокойный аромат для длинных дней.',
      en: 'Warm wood and clear bergamot: a calm scent for long days.',
    },
    variants: v('MO-SW', [240, 420, 980], [12, 8, 4]),
    isNew: true,
    isHit: true,
  },
  {
    handle: 'MO-IRIS-PAPER',
    slug: 'maison-orphee-iris-paper',
    title: 'Iris Paper',
    brand: 'maison-orphee',
    categories: ['femei'],
    gender: 'female',
    family: 'floral',
    notes: ['iris', 'trandafir', 'mosc'],
    pyramid: { top: ['trandafir'], heart: ['iris'], base: ['mosc'] },
    description: {
      ro: 'Iris pudrat pe hârtie caldă — discret, dar prezent.',
      ru: 'Пудровый ирис на тёплой бумаге — сдержанно, но заметно.',
      en: 'Powdery iris on warm paper — restrained, but present.',
    },
    variants: v('MO-IP', [260, 450, 1040], [6, 5, 2]),
    isNew: true,
  },
  {
    handle: 'MO-NUIT-AMBREE',
    slug: 'maison-orphee-nuit-ambree',
    title: 'Nuit Ambrée',
    brand: 'maison-orphee',
    categories: ['unisex'],
    gender: 'unisex',
    family: 'oriental',
    notes: ['vanilie', 'santal', 'piper-negru'],
    pyramid: { top: ['piper-negru'], heart: ['vanilie'], base: ['santal'] },
    description: {
      ro: 'Vanilie întunecată și piper — o seară care nu se grăbește.',
      ru: 'Тёмная ваниль и перец — вечер, который никуда не спешит.',
      en: 'Dark vanilla and pepper — an evening in no hurry.',
    },
    variants: v('MO-NA', [280, 480, 1120], [4, 3, 0]),
    isHit: true,
  },
  {
    handle: 'NA-COLD-CEDAR',
    slug: 'nord-atelier-cold-cedar',
    title: 'Cold Cedar',
    brand: 'nord-atelier',
    categories: ['barbati'],
    gender: 'male',
    family: 'woody',
    notes: ['cedru', 'piper-negru', 'lamaie'],
    pyramid: { top: ['lamaie'], heart: ['piper-negru'], base: ['cedru'] },
    description: {
      ro: 'Cedru rece și lămâie tăioasă: aer de dimineață în pădure.',
      ru: 'Холодный кедр и резкий лимон: утренний воздух в лесу.',
      en: 'Cold cedar and sharp lemon: morning air in a forest.',
    },
    variants: v('NA-CC', [220, 390, 900], [10, 7, 5]),
    isNew: true,
  },
  {
    handle: 'NA-PALE-LINEN',
    slug: 'nord-atelier-pale-linen',
    title: 'Pale Linen',
    brand: 'nord-atelier',
    categories: ['unisex'],
    gender: 'unisex',
    family: 'fresh',
    notes: ['lamaie', 'mosc', 'iris'],
    pyramid: { top: ['lamaie'], heart: ['iris'], base: ['mosc'] },
    description: {
      ro: 'Textil curat și mosc alb — cea mai simplă formă de prospețime.',
      ru: 'Чистый текстиль и белый мускус — простейшая форма свежести.',
      en: 'Clean textile and white musk — freshness at its simplest.',
    },
    variants: v('NA-PL', [200, 360, 840], [14, 9, 6]),
  },
  {
    handle: 'NA-STONE-GARDEN',
    slug: 'nord-atelier-stone-garden',
    title: 'Stone Garden',
    brand: 'nord-atelier',
    categories: ['unisex'],
    gender: 'unisex',
    family: 'chypre',
    notes: ['bergamota', 'trandafir', 'cedru'],
    pyramid: { top: ['bergamota'], heart: ['trandafir'], base: ['cedru'] },
    description: {
      ro: 'Piatră udă, trandafir și lemn: o grădină după ploaie.',
      ru: 'Мокрый камень, роза и дерево: сад после дождя.',
      en: 'Wet stone, rose and wood: a garden after rain.',
    },
    variants: v('NA-SG', [230, 400, 940], [3, 2, 1]),
  },
  {
    // Единственный товар, у которого нет ни одного варианта в наличии:
    // на нём проверяются плашка «нет в наличии» в карточке и блокировка
    // всех объёмов на странице товара.
    handle: 'NA-WINTER-ARCHIVE',
    slug: 'nord-atelier-winter-archive',
    title: 'Winter Archive',
    brand: 'nord-atelier',
    categories: ['unisex'],
    gender: 'unisex',
    family: 'woody',
    notes: ['cedru', 'iris', 'mosc'],
    pyramid: { top: ['iris'], heart: ['cedru'], base: ['mosc'] },
    description: {
      ro: 'Ediție de arhivă: cedru rece și iris. Momentan epuizat.',
      ru: 'Архивный выпуск: холодный кедр и ирис. Сейчас распродан.',
      en: 'An archive release: cold cedar and iris. Currently sold out.',
    },
    variants: v('NA-WA', [250, 430, 990], [0, 0, 0]),
  },
  {
    handle: 'CL-VANILIE-CALDA',
    slug: 'casa-lumina-vanilie-calda',
    title: 'Vanilie Caldă',
    brand: 'casa-lumina',
    categories: ['femei'],
    gender: 'female',
    family: 'oriental',
    notes: ['vanilie', 'mosc'],
    pyramid: { top: ['bergamota'], heart: ['vanilie'], base: ['mosc'] },
    description: {
      ro: 'Vanilie de bucătărie, fără dulceață excesivă.',
      ru: 'Домашняя ваниль без избыточной сладости.',
      en: 'Kitchen vanilla, without excess sweetness.',
    },
    variants: v('CL-VC', [150, 260, 590], [20, 15, 9]),
    isSale: true,
  },
  {
    handle: 'CL-TRANDAFIR-DE-MAI',
    slug: 'casa-lumina-trandafir-de-mai',
    title: 'Trandafir de Mai',
    brand: 'casa-lumina',
    categories: ['femei'],
    gender: 'female',
    family: 'floral',
    notes: ['trandafir', 'iasomie', 'mosc'],
    pyramid: { top: ['iasomie'], heart: ['trandafir'], base: ['mosc'] },
    description: {
      ro: 'Trandafir proaspăt tăiat, fără nostalgie.',
      ru: 'Только что срезанная роза, без ностальгии.',
      en: 'Freshly cut rose, without nostalgia.',
    },
    variants: v('CL-TM', [160, 270, 620], [11, 8, 4]),
    isHit: true,
  },
  {
    handle: 'CL-PIPER-SI-LEMN',
    slug: 'casa-lumina-piper-si-lemn',
    title: 'Piper și Lemn',
    brand: 'casa-lumina',
    categories: ['barbati'],
    gender: 'male',
    family: 'fougere',
    notes: ['piper-negru', 'cedru', 'santal'],
    pyramid: { top: ['piper-negru'], heart: ['cedru'], base: ['santal'] },
    description: {
      ro: 'Condimente uscate și lemn — pentru serile de toamnă.',
      ru: 'Сухие специи и дерево — для осенних вечеров.',
      en: 'Dry spice and wood — for autumn evenings.',
    },
    variants: v('CL-PL', [155, 265, 600], [7, 6, 3]),
  },
  {
    handle: 'CL-SET-DESCOPERIRE',
    slug: 'casa-lumina-set-descoperire',
    title: 'Set Descoperire',
    brand: 'casa-lumina',
    categories: ['seturi', 'unisex'],
    gender: 'unisex',
    family: 'fresh',
    notes: ['bergamota', 'iasomie', 'cedru'],
    pyramid: { top: ['bergamota'], heart: ['iasomie'], base: ['cedru'] },
    description: {
      ro: 'Trei mostre de 2 ml pentru a găsi aroma potrivită.',
      ru: 'Три пробника по 2 мл, чтобы найти свой аромат.',
      en: 'Three 2 ml samples to find the right scent.',
    },
    variants: [
      { volume: 6, sku: 'CL-SD-06', price: 180, stock: 25 },
      { volume: 12, sku: 'CL-SD-12', price: 320, oldPrice: 360, stock: 12 },
    ],
    isNew: true,
    isSale: true,
  },
]
