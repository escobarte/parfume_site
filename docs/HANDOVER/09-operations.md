# 09. Эксплуатация: runbook

- **Для кого:** дежурный разработчик или технический администратор.
- **Что здесь:** деплой и проверка после него; миграции (создание, откат); бэкапы и восстановление; типовые инциденты (симптом → причина → проверка → исправление); заглушка; GA4 и Search Console; пользователи админки; смена секретов.

Логи приложения: Coolify → приложение → Logs (там же вывод `docker-entrypoint.sh`: починка прав, миграции, старт). Все сообщения о заявках имеют префикс `[order MF-…]`.

---

## 1. Деплой

1. Влить изменения в `phase_8.0`, выполнить `git push origin phase_8.0`, убедиться, что `origin/phase_8.0` указывает на нужный коммит (`git log --oneline`).
2. Coolify → приложение → **Redeploy**. Сборка идёт по Dockerfile без доступа к БД.
3. Дождаться в логах строк `[entrypoint] applying Payload migrations...` → `migrations up to date, starting app...`.
4. Проверка после деплоя (read-only):
   - `curl -s -o /dev/null -w '%{http_code}' https://monflacon.md/ro` → 200; то же для `/ru/catalog`, страницы любого товара, `/robots.txt`, `/sitemap.xml`;
   - `/admin` открывается со стилями, вход работает;
   - если менялся код каталога/цен — открыть каталог в окне инкогнито; при застое нажать «Сбросить кэш витрины»;
   - если менялась логика заявок — одна тестовая заявка (с пометкой в комментарии), проверить Telegram, письмо, файл в админке; затем удалить заявку.
5. Если в изменении есть **разовый скрипт для прода** (как `scripts/seed-pages-only.ts`) — его нужно отдельно запустить в Coolify Terminal внутри контейнера: `./node_modules/.bin/tsx scripts/<скрипт>.ts`. Деплой сам скрипты не запускает.

Переменные `NEXT_PUBLIC_*` подставляются на сборке — их изменение требует **Redeploy**, а не Restart. Остальные переменные достаточно поменять и перезапустить контейнер.

---

<a id="миграции"></a>
## 2. Миграции

Схема — только миграциями (`push: false`, `src/migrations/`). На проде они применяются **сами** при старте контейнера; ручной шаг не нужен.

**Создать миграцию** после правки коллекции/глобала:

```bash
pnpm migrate:create <имя>      # payload migrate:create
pnpm migrate                   # применить на dev
pnpm generate:types            # обновить src/payload-types.ts
pnpm generate:importmap        # если добавлялись компоненты админки
pnpm tsc --noEmit
```

`migrate:create` интерактивен: спрашивает «created or renamed» в raw-mode и в неинтерактивной оболочке зависает. Обход: запуск через псевдотерминал — `script -qc "pnpm migrate:create <имя>" /dev/null` с ответами `\r`; надёжнее — python `pty.fork()`, отвечающий `\r` только после появления вопроса. Каждый ответ по умолчанию означает «создать»; после генерации проверить SQL — в нём не должно быть `RENAME`, если переименований не задумывалось.

**Что генератор не делает сам:**
- не переносит данные при смене локализации поля (переносить руками внутри той же миграции);
- не видит ручные индексы поиска (GIN/trigram) — их удалять и пересоздавать руками;
- ставит новую enum-колонку `DEFAULT '<первое значение>' NOT NULL`, молча окрашивая старые строки — проверить смысл;
- в `down` может генерировать неисполнимый `DROP CONSTRAINT` после `DROP TABLE … CASCADE` — использовать `IF EXISTS`;
- `ALTER TYPE … ADD VALUE` нельзя использовать в той же транзакции.

**Правило «вверх → вниз → вверх».** Каждую новую миграцию прогонять на dev: `pnpm migrate`, затем `pnpm payload migrate:down`, затем снова `pnpm migrate` — и проверять данные на каждом шаге. `up` обычно проходит, а сломанный `down` обнаруживается только в день, когда откат понадобится.

**Откат на проде.** Автоматического отката нет: entrypoint умеет только `migrate`. Откатить последнюю миграцию можно вручную в Coolify Terminal контейнера: `node node_modules/payload/bin.js migrate:down`. Перед этим — свежий бэкап БД. Затем задеплоить код, в котором этой миграции нет, иначе она снова применится при старте.

**Сироты.** Если в БД есть тип/колонка, которых не создаёт ни одна миграция репозитория — смотреть `SELECT name, batch FROM payload_migrations` на записи без файла (например, миграция из ветки, которая не была слита).

---

## 3. Бэкапы и восстановление

| Что | Как | Куда | Когда | Хранение |
|---|---|---|---|---|
| Postgres | встроенные Backups Coolify, S3 Storage на B2 | Backblaze B2 + локальная копия на VPS | ежедневно 03:00 Europe/Chisinau (таймзона задана в Coolify) | 30 в B2, 14 локально; алерт «нет бэкапа» через 26 ч |
| Медиа | `scripts/backup-media.sh` (копия скрипта лежит на хосте в `/opt/monflacon/`), cron root на хосте | `/opt/backups/media/` + B2 | по расписанию cron (еженедельно, воскресенье 01:00 UTC) | `RETENTION` локально, `RETENTION_REMOTE` в B2 |
| Код | GitHub (публичный репозиторий) | — | при push | — |
| Файлы для 1С | не бэкапятся (данные заявок есть в БД) | — | — | — |

Фактическое расписание и глубина хранения — `crontab -l` под root на хосте и `/etc/monflacon-backup.env`.

Скрипт медиа запускается **на хосте**, не в контейнере: ему нужен `docker inspect`, чтобы найти путь volume. Он ищет контейнер, у которого смонтирован `/app/media`, архивирует, ротирует локальные архивы, выгружает в B2 через rclone и ротирует там (`hard_delete=true` обязателен). Использует `flock` от параллельного запуска, пишет лог и возвращает ненулевой код при ошибке.

**Как проверить, что бэкапы делаются:**
- Coolify → Postgres → Backups: свежая запись со статусом Success и метками локальной и S3-копии;
- на хосте: `ls -lt /opt/backups/media/` и `tail /opt/backups/media/cron.log`;
- в B2 → Browse Files: свежие файлы; в B2 → Buckets — Current Size (бесплатный лимит 10 ГБ).

**Восстановление** — [`docs/restore-drill.md`](../restore-drill.md). Учебное восстановление (restore-drill) рекомендуется проводить периодически: оно подтверждает, что из бэкапа поднимается рабочая база.

---

## 4. Типовые инциденты

| Симптом | Вероятная причина | Как проверить | Как исправить |
|---|---|---|---|
| **Товар не появился на сайте** | (1) кэш витрины после CLI-импорта/прямой правки БД; (2) товар не опубликован; (3) нет активных вариантов с ценой; (4) раздел не тот — `productCategory`/`gender` не попадают в нужный раздел | `/admin`: статус публикации, варианты, «Кому», раздел; открыть `/ro/catalog` в инкогнито | «Сбросить кэш витрины» или пересохранить товар; опубликовать; поправить поля. Помнить: For Her/For Him показывают только `perfume` |
| **404 после создания страницы** | (1) slug совпал со статической папкой — страницу затеняет маршрут (зарезервированные slug проверка не пропустит, но новая папка могла не попасть в `RESERVED_PAGE_SLUGS`); (2) документ не сохранён/язык; (3) кэш | точный slug в `/admin`; открыть `/ro/<slug>`; есть ли папка `src/app/(frontend)/[locale]/<slug>` | поменять slug; добавить имя папки в `RESERVED_PAGE_SLUGS`; сбросить кэш |
| **Заглушка не выключается** | (1) `MAINTENANCE_MODE` всё ещё `1` (или контейнер не перезапущен); (2) Cloudflare закэшировал старую заглушку | переменная в Coolify; `curl -sI https://monflacon.md/ro` → заголовки `cache-control`, `cf-cache-status` | поставить `0`/пусто и перезапустить; при `cf-cache-status: HIT` — Purge Cache в Cloudflare |
| **Письма не приходят** | нет/неверный `RESEND_API_KEY`, пуст `ORDER_EMAIL_TO`, `ORDERS_DRY_RUN=1`, не задан `ORDER_EMAIL_FROM`, проблемы домена в Resend, спам | логи: `[order …] email skipped (…)` или `resend 4xx: …`; Resend → Logs/Domains | исправить переменную и перезапустить; проверить статус домена; клиентское письмо уходит только если покупатель указал email |
| **Заявка есть, Telegram молчит** | токен/чат не заданы или `CHANGEME…`, `ORDERS_DRY_RUN=1`, бот удалён из чата/заблокирован, ошибка Telegram API | логи: `telegram skipped` или `telegram 400/401/403: …` | исправить переменные; добавить бота в чат; повторной отправки нет — переслать заявку вручную из админки |
| **Фото не загружаются (EACCES)** | неверный владелец `/app/media` (volume смонтирован от root) | логи: `EACCES: permission denied, open 'media/…'`; в логах старта должна быть строка `fixing ownership of /app/media` | убедиться, что в Dockerfile **нет** `USER nextjs` и entrypoint отработал; перезапуск контейнера. Временно: `docker exec -u root <контейнер> chown -R 1001:1001 /app/media` |
| **Каталог пустой после импорта** («0 из 0») | импорт шёл отдельным процессом (CLI), кэш `/catalog` остался от пустой БД | данные в админке есть, на витрине нет | «Сбросить кэш витрины» (или сохранить любой товар). Не ждать TTL |
| **Цена в корзине не та** | корзина хранит цену с момента добавления; обновляется при открытии корзины (`/api/cart-revalidate`); сервер всё равно считает по БД | сравнить цену в админке и в корзине; DevTools → Network → `cart-revalidate` | обычно само; если товар выключен — позиция пропадёт. Итог заявки всегда считается сервером |
| **Админка без стилей** / «PayloadComponent not found in importMap» | не сгенерирован import map после добавления компонентов; кастомный view не обёрнут в `DefaultTemplate` | ошибка в логах/консоли | `pnpm generate:importmap`, пересобрать; для своих views — обёртка `DefaultTemplate` (как `ImportView.tsx`) |
| **ZIP-импорт «висит»** | архив больше ~100 МБ — лимит Cloudflare Free | размер архива | делить на части ~40 МБ |
| **Импорт отклонён целиком** | ошибка формата (неверный `gender`/`locale`, отрицательное число, дубль `sku`), правило скидки «на всех вариантах» | отчёт импорта (номера строк) | исправить файл, снова в режиме «Проверка» |
| **Контейнер не стартует после деплоя** | упала миграция (`set -e`), нет связи с Postgres | логи деплоя после `applying Payload migrations` | чинить миграцию/подключение; откатить коммит и задеплоить |
| **OG-превью в соцсетях старое** | соцсети кэшируют картинку по URL | Facebook Sharing Debugger | при правке общей OG-заглушки — поднять `OG_FALLBACK_VERSION` в `src/lib/seo/config.ts`; перескрапить ссылку |

---

## 5. Заглушка «сайт в разработке»

- **Включить:** в Coolify `MAINTENANCE_MODE=1`, `MAINTENANCE_BYPASS_TOKEN=<случайная строка, напр. openssl rand -hex 16>` → перезапуск контейнера (пересборка не нужна). Проверить с телефона в мобильной сети и в инкогнито.
- **Войти самому:** `https://monflacon.md/?preview=<токен>` — ставит cookie на 30 дней. Смена токена выкидывает всех ранее впущенных.
- **Выключить:** `MAINTENANCE_MODE=0` (или удалить) → перезапуск. Если кто-то всё ещё видит заглушку — Purge Cache в Cloudflare.
- `/admin`, `/api`, `robots.txt`, `sitemap.xml`, OG-превью работают и при включённой заглушке. Заявки при заглушке тоже принимаются (API открыт).
- Кнопки соцсетей на заглушке — `NEXT_PUBLIC_SOCIAL_*`, только через Redeploy.

---

## 6. GA4 и Search Console

- **GA4.** Код готов (`src/components/analytics/`, `src/lib/analytics/`): скрипт грузится только после согласия в баннере, 4 события, IP анонимизируется. Включить: создать property и Web stream в GA4 → Measurement ID → `NEXT_PUBLIC_GA_ID` в Coolify → **Redeploy** (не Restart). Пустое/плейсхолдерное значение — баннер не показывается вовсе.
- **Search Console.** Подтвердить домен (через DNS в Cloudflare), добавить `https://monflacon.md/sitemap.xml`. Кода не требует.

---

## 7. Пользователи админки

- Добавить менеджера/админа: `/admin` → «Система → Пользователи» → «Создать»: email, имя, пароль, роль. По умолчанию роль «Менеджер». Создаёт только администратор.
- Менеджер видит заявки (полный цикл, кроме удаления), каталог только на чтение, может загружать файлы в Media; не видит пользователей, глобалы, экраны импорта.
- После заведения нового менеджера полезно один раз войти под ним и убедиться, что «Импорт каталога» и «Сбросить кэш витрины» не видны.
- Смена пароля пользователя — администратор в карточке пользователя (`/admin` → «Система → Пользователи»).

---

## 8. Смена секретов

| Секрет | Где менять | Последствия |
|---|---|---|
| `PAYLOAD_SECRET` | Coolify → переменные приложения → перезапуск | все сессии админки разлогинятся |
| Пароль Postgres | сервис Postgres в Coolify + `DATABASE_URI` приложения | приложение не подключится, пока обе стороны не совпадут |
| `TELEGRAM_BOT_TOKEN` | @BotFather (revoke) → Coolify → перезапуск | до замены Telegram-канал не работает |
| `RESEND_API_KEY` | Resend → API Keys (новый ключ, старый удалить) → Coolify → перезапуск | |
| `MAINTENANCE_BYPASS_TOKEN` | Coolify → перезапуск | старые cookie байпаса недействительны |
| Ключ B2 для медиа | B2 → App Keys → `/etc/monflacon-backup.env` на хосте | проверить ручным запуском скрипта |
| Ключ B2 для Postgres | B2 → Coolify → Settings → S3 Storage → Validate | проверить Back Up Now |
| Пароль SFTP 1С | на хосте `passwd order-export` | сообщить 1С-специалисту |
| Пароли пользователей админки | `/admin` → Пользователи | |
| SSH, панель Coolify, хостинг, домен, Cloudflare, GitHub | в соответствующих панелях | обновить хранилище секретов |

После любой смены — обновить хранилище секретов. Значения в репозиторий не писать: репозиторий публичный.

---

## 9. Справочник эндпоинтов (для диагностики)

| Метод и путь | Кто может | Файл | Подробно |
|---|---|---|---|
| `POST /api/order-request` | все, лимит по IP | `src/app/(frontend)/api/order-request/route.ts` | [04](04-order-flow.md) |
| `POST /api/order-status` | все, лимит по IP | `.../api/order-status/route.ts` | [04](04-order-flow.md) |
| `POST /api/cart-revalidate` | все | `.../api/cart-revalidate/route.ts` | [04](04-order-flow.md) |
| `POST /api/promo-code-check` | все, без лимита | `.../api/promo-code-check/route.ts` | [04](04-order-flow.md) |
| `POST /api/promo-popup` | все, лимит по IP; 403, если попап выключен | `.../api/promo-popup/route.ts` | [04](04-order-flow.md) |
| `GET /api/search/suggest?q=&locale=` | все | `.../api/search/suggest/route.ts` | [05](05-catalog-and-content.md) |
| `POST /api/catalog-import` | admin | `src/endpoints/adminCatalog.ts` | [06](06-import.md) |
| `POST /api/catalog-revalidate` | admin | `src/endpoints/adminCatalog.ts` | [05](05-catalog-and-content.md#кэш-витрины) |
| `POST /api/media-import` | admin | `src/endpoints/adminMedia.ts` | [06](06-import.md) |
| `POST /api/notes-import` | admin | `src/endpoints/adminNotes.ts` | [06](06-import.md) |
| `POST /api/campaign-start`, `POST /api/campaign-stop` | admin | `src/endpoints/adminCampaigns.ts`, логика `src/lib/campaigns/run.ts` | [03](03-data-model.md) §2.10 |
| `GET /api/orders/bulk-csv?where…` | admin, manager | `src/collections/Orders.ts` | [04](04-order-flow.md) |
| `GET /api/orders/:id/pdf` | admin, manager (аноним 401) | `src/collections/Orders.ts` | [04](04-order-flow.md) |
| `/api/<collection>`, `/api/globals/<slug>`, `/api/users/login` | по `access` коллекции | REST Payload, `src/app/(payload)/api/[...slug]/route.ts` | [03](03-data-model.md) |
| `/api/graphql`, `/api/graphql-playground` | по `access` коллекций | `src/app/(payload)/api/graphql*/route.ts` (стандартные файлы шаблона Payload) | — |

Быстрая проверка, что эндпоинт жив, без побочных эффектов: `curl -s -X POST https://monflacon.md/api/cart-revalidate -H 'content-type: application/json' -d '{"items":[]}'` → `{"ok":true,"items":[]}`. Медиафайлы проверять обычным GET, не `curl -I` (HEAD у Payload отдаёт 404).
