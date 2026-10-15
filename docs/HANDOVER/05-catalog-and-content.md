# 05. Каталог, контент и кэш витрины

- **Для кого:** разработчик витрины; тот, кто разбирается «почему товар не появился» или «почему цена/порядок не те».
- **Что здесь:** как строится выдача каталога (запросы, фасеты, URL-состояние, разделы), правило цены карточки, поиск, страница товара, главная, страницы/меню/футер, подарки, и главное — кэш витрины: что его сбрасывает, а что нет.

См. также: [03-data-model.md](03-data-model.md), [02-request-flow.md](02-request-flow.md), [06-import.md](06-import.md).

---

## 1. Каталог

### 1.1. Файлы

| Файл | Роль |
|---|---|
| `src/lib/catalog/searchParams.ts` | состояние каталога в URL (nuqs): `brand[]`, `gender[]`, `country[]`, `flags[]` (`isNew`/`isHit`/`hasDiscount`), `priceMin`, `priceMax`, `sort`, `page`, `q`; `PAGE_SIZE = 24`; отдельный лоадер для поиска (дефолт сортировки `relevance`) и подмножество сортировок для подарков |
| `src/lib/catalog/queries.ts` | `getProductCards` (выдача), `getFacetSource` (данные для фасетов), `getFlaggedProducts` (ленты главной), `countProductsInCategories`; `scopeWhere` + `filterWhere`; таблица сортировок `SORT` |
| `src/lib/catalog/facets.ts` | предикаты фасетов и `computeFacets` (счётчики «сколько будет, если выбрать», границы слайдера цены) |
| `src/lib/catalog/sections.ts` | закрытые разделы левого меню (scope) |
| `src/lib/catalog/navSections.ts` | пункты левой колонки: For Her, For Him, Kids, Body Care, Skin Care (ключ `lipBalm`), Gift Card, Gift Box, Brands, About |
| `src/lib/catalog/cards.ts` | `toCard` — документ товара → данные карточки |
| `src/lib/catalog/product.ts` | `getProductBySlug` и `toView` — данные страницы товара |
| `src/lib/catalog/taxonomy.ts`, `brands.ts` | справочники (тег `taxonomy`) |
| `src/components/catalog/*` | `CatalogView`, `CatalogSectionPage`, `CatalogShell` (левая колонка на всех разделах), `FiltersDrawer` (фильтры в выезжающей панели на всех ширинах), `FilterPanel`, `SortSelect`, `LoadMore`, `ProductCard` |

### 1.2. Выдача

`getProductCards(locale, query, scope)`: условия = `scopeWhere(scope)` (раздел/категория/бренд/результаты поиска) + `filterWhere(query)` (выбор пользователя). Пагинации «страницами» нет: `?page=N` отдаёт N × 24 товаров одним запросом — ссылка на `?page=3` открывает тот же экран, дублей не бывает.

> **Важно.** Витрина читает данные через Local API, который по умолчанию работает с `overrideAccess: true`, а `payload.find` без `draft: true` не фильтрует по `_status`. Правило доступа коллекции на код витрины не распространяется: каждый запрос витрины к коллекции с черновиками должен явно содержать условие `_status: 'published'`.

Фильтры в панели: бренд, «Кому» (`gender`), страна, цена. Флаги (`isNew`/`isHit`/`hasDiscount`) поддерживаются в URL (например, ссылка `catalogNew` = `/catalog?flags=isNew`), но в панели фильтров не выводятся.

Сортировки (`SORT` в `queries.ts`): `priceAsc`/`priceDesc` → по `maxPrice`, затем `title`; `titleAsc` → по `title` (дефолт каталога); `discount` → по `-maxDiscountPercent`, затем `title`; `relevance` — только на `/search` (ранг FTS; на остальных страницах значение отбрасывается в `titleAsc`). `title` вторым ключом — чтобы товары с одинаковой ценой не «прыгали» между заходами.

### 1.3. Правило цены карточки — `maxPrice`, в трёх местах

Карточка показывает **одну** цену — максимальную среди активных вариантов (`toCard` → `displayPrice`), без «от» и диапазона. Ровно это число используется:

1. в условии выдачи по цене — `filterWhere` в `queries.ts` (`maxPrice >= priceMin`, `maxPrice <= priceMax`);
2. в предикате счётчиков фасетов — `price` в `facets.ts` (по `displayPrice`);
3. в границах слайдера цены — `computeFacets` в `facets.ts`.

И в сортировке по цене. Все три места должны говорить одно, иначе «до 600» покажет карточки по 900, а число у фасета разойдётся с числом карточек. Следствие правила: товар 3ml по 200 и Full Size по 900 не попадает в фильтр «до 600».

### 1.4. Закрытые разделы — `sections.ts`

| Раздел | URL | Scope | Фасет «Кому» |
|---|---|---|---|
| For Her | `/catalog/for-her` | `gender ∈ {female, unisex}`, `productCategory = perfume` | скрыт, `gender` из URL игнорируется |
| For Him | `/catalog/for-him` | `gender ∈ {male, unisex}`, `productCategory = perfume` | скрыт |
| Kids | `/catalog/kids` | `gender = kids`, любая категория | скрыт |
| Body Care | `/catalog/body-care` | `productCategory = bodyCare` | есть |
| Skin Care | `/catalog/lip-balm` | `productCategory = lipBalm` | есть |

Раздел задаётся маршрутом, а не query-параметром: никакие фильтры внутри раздела из него не выводят. `unisex` виден и в For Her, и в For Him; детские товары любой категории — и в Kids, и в своём разделе ухода. Новый тип товара (новое значение `productCategory`) не попадёт ни в один раздел, пока для него не заведён свой — будет виден только в общем `/catalog`. Подпись «Skin Care» задана в `messages/*.json` (`CatalogNav.lipBalm`); slug, value и CSV — `lip-balm`/`lipBalm`.

### 1.5. Поиск

`src/lib/search/fts.ts`, сырой SQL через `payload.db.pool` (Local API не умеет tsvector/trigram). Три механики: `to_tsquery` по конфигу локали (`romanian`/`russian`/`english`, префиксный поиск `слово:*`), `pg_trgm` `word_similarity` с порогом 0.55 (опечатки), транслитерация запроса (кириллица находит латинские названия). Подсказки — `GET /api/search/suggest?q=…&locale=…` (≥ 2 символов, 8 результатов); страница `/search` берёт до 200 slug-ов, ранжирует и режет страницу уже после ранжирования.

**Индексы поиска созданы руками в миграциях**, Payload о них не знает: `20260804_200000_search.ts` (расширение `pg_trgm`, GIN-индексы FTS и trigram), перенос при снятии локализации — `20260822_140412_phase8_1_title_not_localized.ts` (и аналогично у брендов). `payload migrate:create` эти индексы не видит: при переносе колонки их нужно удалять и создавать заново вручную в той же миграции, а сырой SQL в `fts.ts` проверять grep-ом на `*_locales`.

---

## 2. Страница товара

`src/app/(frontend)/[locale]/product/[slug]/page.tsx`, данные — `getProductBySlug` (`src/lib/catalog/product.ts`, тег `products`).

- **Варианты.** Кнопки объёма в каноническом порядке `PRODUCT_VOLUMES`. Выбранный объём хранится в URL: `?volume=<slugify(volume)>` (например `full-size`), `history: replace` (`src/components/product/useSelectedVariant.ts`). Неактивные варианты не показываются; у распроданных — плашка наличия.
- **Фото по объёму.** Если у варианта задан `image`, при выборе этого объёма он заменяет главное фото галереи; иначе — первое фото `images`. Галерея (`Gallery.tsx`) берёт размер `full` (без кропа), есть клавиатура, свайп, стрелки и режим увеличения.
- **Пирамида нот** под фото (верх/сердце/база); у нот без иконки — плейсхолдер. Строка под названием показывает `family`.
- **Цена** — `priceLine` без промокода: текущая цена, зачёркнутая `oldPrice` и бейдж процента, если скидка есть.
- SEO: `generateMetadata`, JSON-LD Product + AggregateOffer + BreadcrumbList (`src/lib/seo/jsonld.ts`).

---

## 3. Главная

`src/app/(frontend)/[locale]/page.tsx` + глобал `homepage`:

- **Карусель баннеров** (`src/components/home/HeroCarousel*.tsx`, `HeroBannerSlide.tsx`, данные — `src/lib/content/heroBanners.ts`, тег `homepage`). Три формата картинок: десктоп `image` (рекомендовано 1920×800), планшет `imageTablet` (1024×768), мобильная `imageMobile` (750×1000), через `<picture>` + `getImageProps()` — браузер скачивает только нужную. Каждая картинка — localized upload; обязательна хотя бы в одной локали. **Фолбэк:** сначала ищется нужный формат на любом языке, и только потом десктопная картинка на нужном языке. Нет мобильной ни на одном языке — на телефоне показывается десктопная (с полями). Текст и CTA дизайнер вшивает в саму картинку; у баннера есть ссылка (системная цель / страница / своя).
- **Ленты** «Новинки» (`isNew`) и «Хиты» (`isHit`, включается флагом `hitsRow.enabled`) — `getFlaggedProducts`, сортировка по дате создания, лимит из глобала.
- **Плитки категорий** (`homepage.categoryTiles`) — при пустом списке блок не рендерится.
- **Бренд-строка** — `homepage.featuredBrands`.
- Промо-полоса над шапкой — `settings.promoBanner` (видна, если включена и сегодня внутри `startDate`–`endDate`).
- Попап «первая скидка» — на всех страницах витрины, если включён в `promo-popup-settings` (см. [04](04-order-flow.md)).

---

## 4. Страницы, меню, футер, ссылки

- **Pages**: см. [03](03-data-model.md). Рендер — `src/components/pages/StaticPage.tsx` (`notFound()`, если документа нет). Кэш `getPageBySlug` (`src/lib/content/pages.ts`) **не хранит промах**: страница, созданная после первого 404, открывается сразу.
- **Шапка** — `navigation.header[]`; **футер** (`src/components/layout/Footer.tsx`) — до трёх колонок `navigation.footerColumns`, контакты из `settings.contacts` (телефон, email, адрес со ссылкой на карту `mapUrl`, часы работы), мессенджеры `settings.messengers`, `footerNote`. Ссылка «Отследить заказ» выведена всегда, вне CMS-цикла.
- Кнопки соцсетей на заглушке берутся из `NEXT_PUBLIC_SOCIAL_*` (см. [02](02-request-flow.md)).
- **Внутренние ссылки** — `internalLinkFields(name)` (`src/fields/internalLink.ts`) создаёт поля `{name}Mode` («системная цель» / «страница»), `{name}` (select из `LINK_TARGETS`, без `about`/`delivery`/`contacts` — они выбираются как страница), `{name}Page` (relationship на `pages`), `{name}Override` (своя ссылка, всегда побеждает). Резолвит `resolveInternalLink` (`src/lib/links.ts`). Значение override вводится **без** префикса локали (`/catalog?flags=isNew`), иначе префикс удвоится. Новая системная цель → `LINK_TARGETS` + подпись в `internalLink.ts` + `messages/*.json`.
- Страница «О нас» берёт контакты из `settings.contacts` и содержит встроенную Google-карту.

---

## 5. Подарочные товары

`/gift-certificates` и `/gift-box` — коллекция `gift-items`, разделение по полю `type` (`src/lib/giftItems/queries.ts`, тег `gift-items`). Сортировки: `titleAsc` (по умолчанию), `priceAsc`, `priceDesc`; фильтров нет. В корзину добавляются как позиции `kind: 'gift'`. Промокод на них не действует.

---

<a id="кэш-витрины"></a>
## 6. Кэш витрины

### 6.1. Как устроен

- Страницы витрины динамические (`force-dynamic`), кэшируются **данные**: `unstable_cache(fn, key, { tags, revalidate: CACHE_TTL })`. Кэш хранится на диске контейнера (`.next/cache`) и переживает перезапуск процесса, но не пересоздание контейнера при деплое.
- Теги (`src/lib/revalidate.ts`): `products` (`CATALOG_TAG`), `gift-items` (`GIFT_TAG`), `taxonomy` (`TAXONOMY_TAG`), `globals` (`GLOBALS_TAG`), `homepage` (`HOMEPAGE_TAG`).
- `CACHE_TTL = 300` с (`src/lib/cache.ts`) — только страховка. На практике после изменения данных из отдельного процесса запись может не обновиться и за большее время — не полагаться на «подождать 5 минут».

### 6.2. Единственная точка сброса — `expireTags()`

Все сбросы идут через `expireTags()` в `src/lib/revalidate.ts`: `revalidateTag(tag, { expire: 0 })` для каждого тега + `revalidatePath('/', 'layout')`. `{ expire: 0 }` — потому что профиль `'max'` в Next 16 помечает записи лишь устаревшими, и первый запрос после сброса получает старые данные. `updateTag()` в route handlers не работает. **Правило: второй точки сброса кэша в проекте быть не должно**; контракт сторожит `tests/int/revalidate.int.spec.ts`, сквозной замер — `scripts/check-cache.mjs`.

Обёртки: `revalidateCatalog(tag = 'products')`, `revalidateTaxonomy()` (`products` + `taxonomy`), `revalidateAll()` (все пять тегов).

Вызов вне HTTP-запроса Next (CLI-скрипт) бросает исключение, которое `expireTags` молча гасит — **из отдельного процесса кэш живого сайта не сбрасывается**.

### 6.3. Что сбрасывает кэш, а что нет

| Событие | Сбрасывает? | Какие теги |
|---|---|---|
| Сохранение/удаление товара в `/admin` или через REST | да | `products` |
| Сохранение бренда/категории/ноты | да | `products`, `taxonomy` |
| Сохранение подарка | да | `gift-items` |
| Сохранение страницы `Pages`, глобалов `settings`/`navigation`/`promo-popup-settings` | да | `globals` |
| Сохранение глобала `homepage` | да | `homepage` |
| Загрузка/правка файла в Media | **нет** (у `media` нет хуков) | — |
| CSV-импорт через `/admin/catalog-import` (боевой режим, успешный) | да, все | `revalidateAll()` в `src/endpoints/adminCatalog.ts` |
| Импорт нот через `/admin/notes-import` | да, поштучно хуками `notes` | `products`, `taxonomy` |
| ZIP фото через `/api/media-import` | нет | — |
| Запуск/остановка кампании | да, один раз в конце | все |
| Кнопка «Сбросить кэш витрины» (`POST /api/catalog-revalidate`, только admin) | да | все |
| CLI: `scripts/import.ts`, `pnpm seed`, `scripts/seed-pages-only.ts`, `scripts/set-settings-contacts.ts`, любой `tsx`-скрипт с Local API | **нет** | — |
| Прямой SQL в Postgres, `payload migrate` | **нет** | — |
| Перезапуск контейнера | нет (кэш на диске) | — |

После любого действия из нижней части таблицы — нажать «Сбросить кэш витрины» на `/admin/catalog-import` или сохранить любую запись нужной коллекции в `/admin` (её хук сбросит тег).

Нюансы среды разработки: в dev кнопка сброса ведёт себя иначе, чем в прод-сборке, и проверять кэш нужно только на `pnpm build && pnpm start`. Правка функций-мапперов (`toCard`, `toView`) не видна на уже закэшированных страницах до сброса — в кэше лежит готовый результат маппинга.
