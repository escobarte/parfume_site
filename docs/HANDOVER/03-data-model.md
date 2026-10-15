# 03. Модель данных

- **Для кого:** разработчик, меняющий схему; тот, кто разбирается, «откуда на сайте взялось это значение».
- **Что здесь:** все 11 коллекций и 4 глобала Payload — назначение, ключевые поля, доступ, хуки, денормализация, связи; что локализовано и почему; списки допустимых значений и где они определены; правила целостности; таблица «поле → где ещё показывается».

Источник истины — `src/payload.config.ts` (регистрация), `src/collections/*.ts`, `src/globals/*.ts`, сгенерированные типы `src/payload-types.ts`. Схема БД ведётся **только миграциями** (`push: false`, `src/migrations/`), см. [09-operations.md](09-operations.md#миграции).

---

## 1. Роли и доступ

Роли — поле `role` у `users` (`admin` / `manager`), функции — `src/access/roles.ts`:

| Функция | Кто проходит |
|---|---|
| `adminOnly` | только `admin` |
| `staffOnly` | `admin` и `manager` |
| `publicRead` | все, включая анонима |
| `adminFieldOnly` | правка поля только `admin` |
| `canAccessAdminPanel` | вход в `/admin` — обе роли |

Важно: проверки `access` действуют на REST/GraphQL и на админку. Код витрины и route handlers ходят через **Local API**, который по умолчанию работает с `overrideAccess: true` — так, например, анонимная форма создаёт заказ, хотя `orders.create = staffOnly`.

---

## 2. Коллекции

Порядок — как в `payload.config.ts`.

### 2.1. `products` — товары (`src/collections/Products.ts`)

Группа в админке «Каталог». Включены черновики (`versions.drafts: true`): у документа есть `_status` (`draft`/`published`).

| Поле | Тип | Заметки |
|---|---|---|
| `title` | text, **не** localized | название всегда на английском, одно на все языки |
| `brand` | relationship → `brands`, обязательно | |
| `categories` | relationship → `categories`, hasMany | таксономия; на витрине — `/catalog/[category]` и отбор в кампаниях |
| `gender` | select: `female`/`male`/`unisex`/`kids` (`GENDERS`) | влияет на разделы For Her/For Him/Kids |
| `family` | text, **localized** | ольфакторное семейство, свободный текст |
| `productCategory` | select: `perfume`/`bodyCare`/`lipBalm`, обязательно, по умолчанию `perfume` | раздел каталога, не «Кому» |
| `countryOfOrigin` | select: `uae`/`europe`/`usa`, обязательно, по умолчанию `europe` | фасет «Страна» |
| `description` | richText, **localized** | |
| `images` | upload → `media`, hasMany | первая — обложка |
| `variants[]` | array, минимум 1 | см. ниже |
| `notes` | relationship → `notes`, hasMany | плоский список для фильтров/карточки |
| `pyramid.top/heart/base` | relationship → `notes`, hasMany | пирамида на странице товара, необязательно |
| `handle` | text, unique | ключ строки прайса магазина; по нему upsert при CSV-импорте |
| `slug` | `slugField()` | один на все локали, собирается из `title`, если пуст |
| `isNew`, `isHit` | checkbox | ручные флаги «Новинка»/«Хит» |
| `minPrice`, `maxPrice`, `inStock`, `hasDiscount`, `maxDiscountPercent` | денормализация, readOnly | **руками не заполняются**, см. 4.1 |
| `seo.title/description/image` | группа `seoField` (`src/fields/seo.ts`), title/description localized | пусто — берётся название/описание |

`variants[]`: `volume` (select из 5 значений `PRODUCT_VOLUMES`), `sku` (обязательно, индекс; уникальность гарантирует импорт, не схема), `price` (MDL, ≥ 0), `oldPrice` (цена до скидки), `stock` (≥ 0, по умолчанию 0), `isActive` (по умолчанию да), `image` (фото именно этого объёма, необязательно).

Доступ: чтение — сотрудникам всё, остальным `_status = published`; создание/правка/удаление — `adminOnly`; `readVersions` — `staffOnly`.

Хуки:
- `beforeChange` → `denormalizeVariants()` (`src/lib/products/denormalize.ts`).
- `afterChange` → `revalidateCatalog()` (тег `products`), **кроме** случаев, когда в `context` стоит `skipCatalogRevalidate` (массовые операции кампаний сбрасывают кэш один раз в конце).
- `afterDelete` → `revalidateCatalog()`.
- `validate` на `variants` → `variantsDiscountConsistent` (см. 4.2).

### 2.2. `brands` — бренды (`src/collections/Brands.ts`)

Поля: `title` (**не** localized), `slug`, `description` (textarea, **не** localized), `logo` (upload), `country` (text, localized), `seo`. Бренд-строку главной задаёт глобал `homepage.featuredBrands`. Доступ: чтение публичное, запись `adminOnly`. Хуки `afterChange/afterDelete` → `revalidateTaxonomy()` (теги `products` + `taxonomy`).

Почему title/description не локализованы: бренд, заведённый только на одном языке, иначе приходил бы на другие локали с пустым `title`, и страница `/brands` не строилась бы.

### 2.3. `categories` — категории (`src/collections/Categories.ts`)

Поля: `title` (localized, обязательно), `slug`, `description` (localized), `parent` (relationship на себя, вложенность), `image` (плитка на главной), `order`, `seo`. Доступ как у брендов, хуки → `revalidateTaxonomy()`. Используются в `/catalog/[category]`, плитках главной (`homepage.categoryTiles`, связь `NOT NULL` — удалить категорию с плиткой нельзя, сначала убрать плитку) и в отборе кампаний.

### 2.4. `notes` — ноты (`src/collections/Notes.ts`)

Поля: `title` (не localized), `slug`, `description` (не localized), `image` (иконка), `needsReview` (по умолчанию **true** — заготовка не проверена), `group` (свободный текст). Доступ как у брендов, хуки → `revalidateTaxonomy()`. Заготовки нот автоматически создаются CSV-импортом товаров, если slug ноты не найден (`needsReview: true`, временное название на всех трёх локалях).

### 2.5. `gift-items` — подарочные сертификаты и Gift box (`src/collections/GiftItems.ts`)

Отдельная коллекция, не `products`. Поля: `title` (localized), `slug`, `type` (`certificate`/`giftBox`, по умолчанию `certificate`), `description` (richText, localized), `image`, `variants[]` (`amount` — номинал MDL, `sku`, `stock`, `isActive`), `isActive`, денормализация `minPrice`/`maxPrice`/`inStock` (тем же `denormalizeVariants`, `amount` подставляется как цена, скидок нет). Доступ: публике только `isActive = true`, запись `adminOnly`. Хуки → `revalidateCatalog('gift-items')`. Промокоды на подарки не действуют.

### 2.6. `pages` — контентные страницы (`src/collections/Pages.ts`)

Поля: `title` (localized), `slug` (с проверкой `RESERVED_PAGE_SLUGS`, см. [02-request-flow.md](02-request-flow.md)), `body` (richText, localized), `seo`. Доступ: чтение публичное, запись `adminOnly`. Хуки → сброс тега `globals`. Четыре системных slug — `about`, `delivery`, `returns`, `contacts` — открываются по собственным папкам; остальные — по `/[locale]/[slug]`. Картинки в `body` рендерятся своим конвертером `RichTextImage.tsx` с ограничением высоты; в описаниях товаров/подарков — стандартным (без ограничения).

### 2.7. `media` — файлы (`src/collections/Media.ts`)

Только изображения (`image/*`), фокус-точка. Размеры: `thumb` 300×300 и `card` 600×600 (центр-кроп), `full` ширина 1200 (без кропа, **не апскейлит** — у исходника меньше 1200 px `sizes.full` = `null`, код откатывается на оригинал). Карточки и галерея используют `full`, кроп-размеры в сетках не используются. Поля: `alt` (обязательно, localized), `caption` (localized). Доступ: чтение публичное, **создание — `staffOnly` (менеджер тоже может загружать)**, правка/удаление — `adminOnly`. Хуков сброса кэша нет. Файлы на диске — `/app/media` (persistent volume).

### 2.8. `orders` — заявки (`src/collections/Orders.ts`)

Подробно — [04-order-flow.md](04-order-flow.md). Поля: `orderNumber` (unique, readOnly), `statusToken` (unique, readOnly), `status` (`new`/`confirmed`/`ready`/`issued`/`cancelled`), `checkoutMode` (`standard`/`noCall`), `deliveryMethod` (`pickup`/`delivery`), `paymentMethod` (`cash`/`card`), `locale`, `source`, `customer.{name, phone, email, address, messenger}`, `comment`, `items[]` (снимок: `product` relationship, `title`, `brandTitle`, `sku`, `volume`, `price`, `qty`, `lineTotal`, `basePrice`, `discountPercent`, `discountSource`), `total`, `promoCode` (текстовый снимок, не relationship), `promoDiscountPercent`, `promoDiscountAmount`, `exportCsv` (textarea), UI-поля `csvDownload`, `pdfDownload`, `exportPdf`.

Доступ: create/read/update — `staffOnly`, delete — `adminOnly`. Хук `beforeChange` генерирует номер и токен. Эндпоинты `/bulk-csv`, `/:id/pdf`. Сброса кэша нет (заказы на витрине не кэшируются). Колонки списка по умолчанию заданы `defaultColumns`, но у пользователя, однажды настроившего колонки, они хранятся в его preferences и сильнее конфига.

### 2.9. `promo-codes` — промокоды (`src/collections/PromoCodes.ts`)

Поля: `codeType` (`personal`/`public`, по умолчанию `public`), `code` (unique, в верхнем регистре), `percent` (1–100), `isActive`, `isUsed` (readOnly, только personal), `expiresAt` (обязателен для public), `email`/`phone` (обязательны для personal), `customerName`, `usedInOrder` (relationship → `orders`). Хук `beforeChange`: код в UPPERCASE; при `public` обнуляет email/phone/имя, при `personal` — `expiresAt`. Доступ: чтение `staffOnly` (список кодов не перечисляется публично), запись `adminOnly`. Логика — [04-order-flow.md](04-order-flow.md).

### 2.10. `discount-campaigns` — кампании скидок (`src/collections/DiscountCampaigns.ts`)

Ручная массовая уценка. Поля: `name`, `percent` (1–99, от **текущей** цены), `status` (`draft`/`active`/`finished`, меняется только кнопками), `selectionRule.{brands, categories, manualProducts}` (объединение: товар попадает, если подходит хотя бы под один критерий), `startDateNote`/`endDateNote` (только заметки — планировщика нет), `affectedVariantsCount`, `affectedProductsCount`, `startedAt`, `finishedAt`, `journal[]` (что и с какими ценами изменено — источник для отката), `conflicts[]` (что не удалось откатить: `price_changed`/`variant_missing`/`blocked_by_consistency`). Настройки правятся только в черновике (`draftOnlyField`). Доступ: чтение `staffOnly`, запись `adminOnly`. Запуск/остановка — `POST /api/campaign-start` / `/api/campaign-stop` (`src/endpoints/adminCampaigns.ts`, `src/lib/campaigns/run.ts`): кампания пишет `price` и `oldPrice` вариантов, затем один раз `revalidateAll()`.

### 2.11. `users` — пользователи админки (`src/collections/Users.ts`)

`auth: true`. Поля: `email` (от auth), `name`, `role` (`admin`/`manager`, по умолчанию `manager`, сохраняется в JWT, менять может только admin). Хук: первый созданный пользователь автоматически становится `admin`. Доступ: создание/удаление — admin; читать и править менеджер может только себя. Раздел скрыт от менеджера.

---

## 3. Глобалы

| Slug | Файл | Что хранит | Доступ | Сброс кэша |
|---|---|---|---|---|
| `homepage` | `src/globals/Homepage.ts` | `heroBanners[]` (`enabled`, `image`/`imageTablet`/`imageMobile` — localized upload, `alt` localized, ссылка через `internalLinkFields('link')`); `categoryTiles[]` (категория + подпись); `newRow` (заголовок, подпись ссылки, `limit` 2–12); `hitsRow` (+ `enabled`); `featuredBrands` (relationship → brands) | чтение публичное, запись admin; скрыт от менеджера | тег `homepage` |
| `settings` | `src/globals/Settings.ts` | `siteName`, `tagline`, `contacts.{phone, email, address*, workingHours*, mapUrl}`, `messengers.{telegram, viber, whatsapp}`, `social[]` (label/url), `footerNote*`, `promoBanner.{enabled, text*, linkLabel*, ссылка, startDate, endDate}` (* — localized) | то же | тег `globals` |
| `navigation` | `src/globals/Navigation.ts` | `header[]` (label* + ссылка), `footerColumns[]` (до 3: title*, `links[]` label*/href) | то же | тег `globals` |
| `promo-popup-settings` | `src/globals/PromoPopupSettings.ts` | `isEnabled` (по умолчанию нет), `discountPercent` (1–100, по умолчанию 15), `requirePhone` (по умолчанию да), картинки десктоп/мобильная + alt (localized), тексты `title`/`subtitle`/`description`/`buttonLabel`/`footerText` (localized, `{percent}` подставляется) | то же | тег `globals` |

Картинка баннера обязательна хотя бы в одной локали (асинхронный `validate` `imageInSomeLocale`). Показ берёт картинку по цепочке локалей, сначала подбирая нужный формат на любом языке (`src/lib/content/heroBanners.ts`, `src/lib/content/localized.ts`).

---

## 4. Правила целостности

### 4.1. Денормализация — только хуком

`denormalizeVariants()` считает по **активным** вариантам с числовой ценой: `minPrice`, `maxPrice`, `inStock` (хоть один активный вариант со `stock > 0`), `hasDiscount` (хоть один `oldPrice > price`), `maxDiscountPercent`. Вызывается в `beforeChange` у `products` и `gift-items`. Руками эти поля не правятся (readOnly в админке). Если данные изменили **мимо Payload** (прямым SQL), денормализация не пересчитается — нужно пересохранить товар.

`maxPrice` — это цена, которую видит покупатель на карточке; по ней же сортировка и фильтр цены (см. [05](05-catalog-and-content.md)).

### 4.2. Скидка — на все активные варианты или ни на один

`variantsDiscountConsistent` (`Products.ts`) не даёт сохранить товар, у которого скидка (`oldPrice > price`) есть только у части активных вариантов. Причина: карточка показывает одну цену (максимальную), и выборочная скидка была бы видна не всем. Это правило действует на любое сохранение: админку, CSV-импорт, кампании (при откате кампании нарушение уходит в `conflicts` с причиной `blocked_by_consistency`).

> **Важно.** «Лёгкий прайс» меняет только `price`. Если у товара со скидкой новая цена окажется ≥ `oldPrice` лишь на части вариантов, сохранение товара будет отклонено, а с ним откатится весь файл.

### 4.3. Slug

`slugField()` (`src/fields/slug.ts`): один slug на все локали, `unique`, при пустом значении собирается из источника (обычно `title`) через `slugify` — транслитерация, диакритика снимается, любой не-`[a-z0-9]` символ → дефис. Хук срабатывает в `beforeValidate`, поэтому кастомный `validate` видит уже нормализованное значение. CSV-импорт **не меняет** slug существующего товара, если в файле нет колонки `slug`.

### 4.4. Промокоды

Код хранится в верхнем регистре; одноразовость — атомарный условный `UPDATE` после создания заказа; публичный код без `expiresAt` считается просроченным. Подробно — [04-order-flow.md](04-order-flow.md).

### 4.5. Заказ — снимок

Позиции заказа не ссылаются на живые цены: название, бренд, объём, цена записываются на момент заявки. Правка или удаление товара заказ не меняет.

---

## 5. Что локализовано и почему

Локали Payload: `ro` (по умолчанию), `ru`, `en`, `fallback: true` (`src/payload.config.ts`). `fallback` подставляет значение **дефолтной локали** (`ro`), если в запрошенной пусто.

| Локализовано | Не локализовано (одно на все языки) |
|---|---|
| `products.description`, `products.family`, `seo.title/description` везде | `products.title` (названия всегда на английском) |
| `categories.title/description`, `gift-items.title/description` | `brands.title/description`, `notes.title/description` |
| `pages.title/body`, `media.alt/caption`, `brands.country` | все `slug` (URL один на все локали) |
| тексты глобалов (адрес, часы, промо-баннер, меню, попап, картинки баннеров/попапа) | цены, объёмы, остатки, enum-значения |

Особенности: `required: true` у localized-поля проверяется только в редактируемой локали; при обычном `update` с `fallback: true` Payload может сам пролить значение `ro` в пустые локали; проверять «пусто ли поле в этой локали» можно только с `fallbackLocale: false`.

---

## 6. Списки значений — где определены

| Список | Значения | Где определён | Кто ещё использует |
|---|---|---|---|
| Объём `PRODUCT_VOLUMES` | `3ml`, `5ml`, `10ml`, `Travel Size`, `Full Size` | `src/lib/catalog/volumes.ts` | `Products`, `Orders.items.volume`, zod заявки, CSV-импорт |
| Пол `GENDERS` | `female`, `male`, `unisex`, `kids` | `src/collections/Products.ts`; для импорта — `GENDER_VALUES` в `src/lib/import/schema.ts` (дубль) | разделы `sections.ts`, фасет |
| Раздел `PRODUCT_CATEGORIES` | `perfume`, `bodyCare`, `lipBalm` | `src/lib/catalog/productCategories.ts` | `Products`, импорт, разделы |
| Страна `PRODUCT_COUNTRIES` | `uae`, `europe`, `usa` | `src/lib/catalog/countries.ts` | `Products`, фасет, импорт |
| Статус заказа `ORDER_STATUSES` | `new`, `confirmed`, `ready`, `issued`, `cancelled` | `src/collections/Orders.ts` | `messages/*.json` → `OrderStatus` |
| `CHECKOUT_MODES` / `DELIVERY_METHODS` / `PAYMENT_METHODS` / `MESSENGERS` | см. [04](04-order-flow.md) | `src/lib/orders/schema.ts` + дубли подписей в `Orders.ts`, `telegram.ts`, `csv.ts`, `summary.ts` | |
| Тип промокода | `personal`, `public` | `src/collections/PromoCodes.ts` | `promo.ts` |
| Тип подарка | `certificate`, `giftBox` | `src/collections/GiftItems.ts` | разделы Gift Card/Gift Box |
| Статус кампании, причины конфликта | `draft`/`active`/`finished`; `price_changed`/`variant_missing`/`blocked_by_consistency` | `src/collections/DiscountCampaigns.ts` | `run.ts` |
| Цели ссылок `LINK_TARGETS` | `home`, `catalog`, `catalogDiscounted`, `catalogNew`, `brands`, `about`, `delivery`, `contacts`, `orderLookup` | `src/lib/links.ts` | `internalLinkFields` (`src/fields/internalLink.ts`) |
| Роли | `admin`, `manager` | `src/collections/Users.ts` | `src/access/roles.ts` |

Изменение любого из этих списков, хранящихся в БД как Postgres enum, требует миграции (см. [09-operations.md](09-operations.md#миграции) про `ALTER TYPE ... ADD VALUE` и пересоздание enum).

---

## 7. Поле → где ещё показывается

| Поле | Админка | Витрина | CSV импорта | Письмо/Telegram | CSV/PDF заявки |
|---|---|---|---|---|---|
| `products.title` | список, карточка | карточка, страница товара, поиск | `title` | название позиции (снимок) | `product` / «Наименование» |
| `products.brand` | карточка | карточка, `/brands/[slug]`, фасет | `brand` (slug), `brand_logo` | `brandTitle` | `brand` / «Бренд» |
| `variants.volume` | карточка | кнопки объёма, `?volume=` | `volume` | объём позиции | `volume` / «Объём» |
| `variants.sku` | карточка | — (ключ корзины) | `sku` | да | `sku` / «Артикул» |
| `variants.price` / `oldPrice` | карточка | цена, зачёркнутая цена, бейдж % | `price`, `old_price`, «Лёгкий прайс» | цена за шт. после скидки | `price`, `sum` |
| `variants.stock` | карточка | плашка наличия, `inStock` | `stock` | — | — |
| `variants.isActive` | карточка | скрывает вариант; заказ на него отбрасывается | `is_active` | — | — |
| `variants.image` | карточка | главное фото при выборе объёма | `variant_image` | — | — |
| `products.images` | карточка | галерея, обложка | `images` | — | — |
| `description`, `family` | карточка (по локалям) | страница товара / строка под названием | `description[_ro/ru/en]`, `family_ro/ru/en`, файл переводов | — | — |
| `gender`, `productCategory`, `countryOfOrigin` | карточка | разделы и фасеты | `gender`, `product_category`, `country_of_origin` | — | — |
| `notes`, `pyramid` | вкладка «Ноты» | пирамида под фото | `notes`, `notes_top/heart/base` | — | — |
| `isNew`, `isHit` | флаги | ленты главной, `catalogNew` | `is_new`, `is_hit` | — | — |
| `hasDiscount` / `maxDiscountPercent` | readOnly | бейдж, флаг `hasDiscount`, сортировка `discount` | вычисляется | — | — |
| `orders.checkoutMode` | колонка + сайдбар | — | — | тема письма, строка «НЕ ЗВОНИТЬ» | `checkoutMode`, плашка в PDF |
| `orders.promoCode` / суммы | сайдбар, колонка | — | — | строка промокода | `promoCode`, `discount`, строка в PDF |
| `settings.contacts.*` | Настройки | футер, «Контакты», «О нас», JSON-LD | — | — | — |
