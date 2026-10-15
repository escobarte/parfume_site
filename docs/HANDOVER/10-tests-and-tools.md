# 10. Тесты и инструменты

- **Для кого:** разработчик, который вносит изменения и хочет проверить, что ничего не сломал.
- **Что здесь:** интеграционные тесты (vitest), e2e (Playwright), проверочные скрипты `scripts/check-*.mjs`, остальные скрипты `scripts/`; как запускать и обходные пути; что устарело; что безопасно запускать на проде; известные флаки.

Все тесты и проверки рассчитаны на **локальную** среду: dev-Postgres из `docker-compose.dev.yml` и `.env` в корне. Интеграционные тесты подключаются к той же БД, что и dev-сервер (`vitest.setup.ts` грузит `.env`), и создают в ней записи — **не направлять их на прод**.

---

## 1. Подготовка окружения

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 17 на localhost:5432
cp .env.example .env                              # заполнить PAYLOAD_SECRET, ORDERS_DRY_RUN=1
pnpm install
pnpm migrate
pnpm seed                                         # демо-данные + админ SEED_ADMIN_EMAIL/PASSWORD (только dev!)
pnpm dev
```

`pnpm devsafe` — то же, но с удалением `.next` (сброс кэша данных dev). `pnpm seed` на проде не запускать: он перезаписывает документы по slug.

---

## 2. Интеграционные тесты — `pnpm test:int`

Vitest 4, `environment: jsdom`, файлы `tests/int/**/*.int.spec.ts` (`vitest.config.mts`).

| Файл | Что покрывает |
|---|---|
| `api.int.spec.ts` | базовый доступ к Payload API |
| `campaigns.int.spec.ts` | старт/остановка кампаний скидок, полный откат, конфликты |
| `cart-revalidate.int.spec.ts` | актуальные цены в корзине, «позиция больше не заказуема» |
| `hero-banners.int.spec.ts` | порядок локалей и выбор картинки баннера |
| `import.int.spec.ts` | парсер CSV, определение формата, правила импорта (самый большой набор) |
| `order-export.int.spec.ts` | запись CSV-файла для 1С и устойчивость к ошибкам |
| `order-pdf.int.spec.ts` | генерация PDF, кириллица и румынская диакритика, извлечение текста |
| `order-promo-burn.int.spec.ts` | погашение персонального кода (выиграл/проиграл), прямой вызов `POST()` с моком `after()` |
| `pages.int.spec.ts` | зарезервированные slug страниц |
| `phone.int.spec.ts` | разбор телефона: поле ввода и сервер |
| `pricing.int.spec.ts` | `priceLine`, правило «больший процент выигрывает» |
| `promo-code-check.int.spec.ts` | причины отказа промокода, отсутствие лимита на проверке |
| `promo-email.int.spec.ts` | письмо с промокодом |
| `promo-popup-content.int.spec.ts` | цепочка локалей текстов попапа, подстановка `{percent}` |
| `promo.int.spec.ts` | нормализация кода и телефона |
| `revalidate.int.spec.ts` | контракт единой точки сброса кэша `expireTags()` |

---

## 3. E2E — `pnpm test:e2e`

Playwright 1.58.2, Chromium, `workers: 1`, `baseURL http://localhost:3000`, `reuseExistingServer: true` (`playwright.config.ts`).

| Спек | Что проверяет |
|---|---|
| `smoke.e2e.spec.ts` | 3 типа страниц × 3 локали |
| `catalog-filters.e2e.spec.ts` | фильтры и URL-состояние |
| `catalog-sections.e2e.spec.ts` | закрытые разделы левого меню, сортировки |
| `product-volume.e2e.spec.ts` | переключение объёма меняет цену/фото |
| `cart.e2e.spec.ts` | количество, `reload`, сохранение корзины |
| `order-request.e2e.spec.ts` | сквозная заявка при `ORDERS_DRY_RUN=1`, проверка записи в БД через логин админа |
| `promo-popup.e2e.spec.ts` | попап «первая скидка», выдача кода |
| `hero-carousel.e2e.spec.ts` | карусель баннеров, картинки под ширину экрана |
| `pages.e2e.spec.ts` | динамические страницы `[locale]/[slug]` |
| `search-sort.e2e.spec.ts` | сортировка на странице поиска |
| `admin.e2e.spec.ts` | вход в админку |

**Обходные пути (обязательно знать):**
- `pnpm test:e2e` не поднимает dev-сервер сам: `NODE_OPTIONS=--import=tsx/esm` из скрипта ломает запуск `pnpm dev` (ищет несуществующий `.pnpmfile.mjs`). **Поднимать `pnpm dev` в отдельном терминале**, затем запускать тесты.
- Отдельный спек — `./node_modules/.bin/playwright test tests/e2e/<файл>`, не `pnpm exec playwright`.
- `order-request.e2e.spec.ts` требует, чтобы `SEED_ADMIN_PASSWORD` в `.env` совпадал с паролем dev-админа, иначе падает на `expect(order).toBeTruthy()`.
- Лимит заявок: для прогонов поднимать `ORDERS_RATE_LIMIT=30` **и** у dev-сервера, **и** у скрипта; счётчик в памяти — между прогонами перезапускать сервер. Постоянно в `.env` не держать.
- Попап промокода открывается через 2 с и перехватывает клики — спеки, не связанные с ним, ставят `localStorage['mf-promo-popup-seen']='1'` через `addInitScript`.
- Не редактировать файлы во время полного прогона — HMR даёт случайные красные тесты.
- После прогона удалить `playwright-report/` и `test-results/`, иначе `pnpm lint` выдаст тысячи ложных ошибок.
- Тестовые заявки чистить после прогонов.

---

## 4. Проверочные скрипты `scripts/check-*.mjs`

Запускаются вручную (`node scripts/<файл>`), против dev или прод-сборки на localhost (`SHOT_BASE` меняет адрес). В `tsc`, `lint` и CI не участвуют — при изменениях вёрстки/схемы их нужно обновлять вместе с кодом.

| Скрипт | Что проверяет | Примечание |
|---|---|---|
| `check-catalog.mjs` | критерии каталога (фильтры, дровер, сортировка, корзина в шапке) | — |
| `check-orders.mjs` | сквозная заявка: корзина → форма → БД → CSV → каналы, лимит 429, ссылка «Отследить заказ» | нужен `ORDERS_RATE_LIMIT=30` с обеих сторон; на холодном dev изредка падает проверка «пустая корзина» |
| `check-cache.mjs` | сброс кэша кнопкой: свежие данные с первого запроса | **только на прод-сборке** (`pnpm build && pnpm start`); правит название товара прямо в Postgres и возвращает назад |
| `check-stock.mjs` | плашка наличия, блокировка распроданных вариантов | — |
| `check-mockup.mjs` | сверка вёрстки главной с мокапом по измеримым величинам | — |
| `check-promo.mjs` | скидки, промо-баннер | рассчитан на сайдбар фильтров `<aside>` |
| `check-sheet.mjs` | мобильная шторка фильтров | рассчитан на сайдбар фильтров `<aside>` |
| `check-lan.mjs` | интерактив по адресу локальной сети | рассчитан на сайдбар фильтров `<aside>` |

Правило: изменил схему коллекции или разметку каталога — прогони соответствующий check-скрипт в тот же заход.

---

## 5. Остальные скрипты `scripts/`

| Скрипт | Назначение | На проде |
|---|---|---|
| `import.ts` | CSV-импорт из командной строки (`pnpm run import`) | можно (в контейнере: `./node_modules/.bin/tsx scripts/import.ts <файл>`), но лучше через `/admin/catalog-import`; после CLI — сбросить кэш |
| `seed.ts` | демо-данные + админ из `SEED_ADMIN_*` | **нельзя** — перезаписывает документы по slug |
| `seed-load.ts`, `seed-load-clean.ts` | нагрузочные 120 синтетических товаров (`load-NNN`) и их удаление | **нельзя** |
| `seed-pages-only.ts` | создаёт 4 системные страницы `Pages`, если их нет; существующие не трогает | безопасно |
| `set-settings-contacts.ts` | заполняет `settings.contacts`, только если пусто | безопасно |
| `backup-media.sh` (+ `backup-media.env.example`) | бэкап медиа, запускается **на хосте** | да, это прод-скрипт |
| `shots.mjs` | скриншоты 360/768/1280 | не про прод (можно направить `SHOT_BASE` на прод только для чтения) |
| `fixtures/demo-products.csv`, `demo-translations.csv` | демо-каталог для импорта | не нужен |

`seed.ts`/`seed-load.ts` в контейнере дополнительно падают `SIGSEGV` в `sharp` (нет `fontconfig` для SVG-плейсхолдеров) — ещё одна причина не запускать их на проде.

---

## 6. Прочие команды

| Команда | Зачем |
|---|---|
| `pnpm lint` | ESLint |
| `pnpm tsc --noEmit` | проверка типов |
| `pnpm build` / `pnpm start` | прод-сборка локально; `pnpm start` печатает предупреждение про standalone, но работает (для локальных прод-проверок использовать его, а не `node .next/standalone/server.js`) |
| `pnpm generate:types` | обновить `src/payload-types.ts` после изменения схемы |
| `pnpm generate:importmap` | после добавления компонентов админки |
| `pnpm payload <cmd>` | любой CLI Payload (`migrate:status`, `migrate:down` и т.д.) |

Ресурсы dev-машины: `next dev` (Turbopack) раздувается до нескольких ГБ после нескольких полных e2e-прогонов — перезапускать процесс (`ps -eo pid,args | grep next-server` → `kill`).

---

## 7. Известные флаки

- `hero-carousel.e2e.spec.ts`, «картинки под ширину экрана» — под нагрузкой полного прогона; изолированно зелёный.
- `catalog-filters.e2e.spec.ts` — изредка в полном прогоне.
- `catalog-sections.e2e.spec.ts` — чувствителен к таймауту `toHaveURL` в полном прогоне; помогает явный таймаут.
- `check-orders.mjs`, «пустая корзина» — холодная компиляция dev.
- Гидрация в dev: первый клик сразу после навигации может теряться — в спеках «клик + проверка» обёрнуты в `expect(...).toPass()`.

