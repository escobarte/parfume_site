# Бэкапы — операционная инструкция

Фактическая инфраструктура — TopHost VPS + Coolify + Cloudflare DNS (не Hetzner, как в `docs/PLAN.md` §9 — см. `docs/STATE.md` → раздел «Фаза 9»). Внешнее S3-совместимое хранилище — **Backblaze B2** (не Cloudflare R2, как предполагалось раньше). Этот файл писан под фактическое состояние.

## Что бэкапится и как

| Что | Механизм | Где хранится | Периодичность | Ротация |
|---|---|---|---|---|
| **PostgreSQL** (заказы, товары, страницы, пользователи админки, все коллекции) | Встроенные Backups сервиса Postgres в Coolify, S3 Storage **"backblaze-b2"** | Backblaze B2, бакет `monflacon-backups` | cron `0 3 * * *` в таймзоне **Europe/Chisinau** (сервер живёт в UTC, таймзону задаёт поле Timezone в самой Coolify — см. ниже) | retention **30** снапшотов в B2 (настройка Coolify) |
| **Медиа** (`/app/media`, фото товаров) | `scripts/backup-media.sh` (локальный архив + ротация) → `rclone` (выгрузка в B2), запускается cron'ом на самом VPS | Локально: отдельная директория на VPS, вне докерных volume'ов, по умолчанию `/opt/backups/media`. Внешняя копия: Backblaze B2, бакет `monflacon-backups/media` | ежедневно, рекомендация cron `0 4 * * *` (через час после бэкапа БД) | локально — **14** последних архивов (`RETENTION`); в B2 — отдельно, по умолчанию тоже **14** (`RETENTION_REMOTE`) |

Раньше оба бэкапа жили только на том же VPS, что и прод, — единая точка отказа диска/сервера. Теперь это закрыто внешним хранилищем: Postgres уходит в B2 через встроенный механизм Coolify, медиа — через `rclone` из `scripts/backup-media.sh`. Локальные копии (диск VPS) при этом никуда не делись и остаются первой линией — они восстанавливаются быстрее, чем скачивание из B2.

## Внешнее хранилище медиа

Backblaze B2, бакет **`monflacon-backups`** (тот же бакет, что и для Postgres, разные префиксы): регион `eu-central-003`, endpoint `s3.eu-central-003.backblazeb2.com`, тип **Private**, версионирование **"Keep all versions"**. Application Key выдан на этот один бакет, права Read and Write.

`scripts/backup-media.sh` выгружает архив через `rclone` (backend `b2`, не s3-совместимый), конфиг — только переменными окружения `RCLONE_CONFIG_B2REMOTE_*`, без `~/.rclone.conf`. `hard_delete=true` обязателен из-за версионирования бакета — без него ротация в B2 не освобождала бы место (прячет версию вместо удаления, см. `docs/GOTCHAS.md`). Подробности и установка — ниже, раздел «Настройка бэкапа медиа».

## Статус на 2026-10-02

- **Postgres** — настроен и проверен живым прогоном: S3 Storage "backblaze-b2" подключён в Coolify, дамп виден в бакете после ручного запуска.
- **Медиа** — `scripts/backup-media.sh` умеет выгружать архив в B2 через rclone (проверено локально на фейковом remote, см. `docs/CHANGELOG.md`). На проде cron ещё **не установлен** и `/etc/monflacon-backup.env` ещё не создан — это делает владелец вручную (см. ниже; git/ssh-операции на прод-сервере вне зоны Claude Code, `CLAUDE.md`).

## Настройка бэкапа Postgres (Coolify)

1. Coolify → проект → сервис **Postgres** → вкладка **General**: поле **Timezone** — выставить `Europe/Chisinau` (сервер сам живёт в UTC, расписание cron ниже интерпретируется в этой таймзоне, не в UTC — неочевидно, легко промахнуться на 2-3 часа).
2. Вкладка **S3 storage**: кнопка **Enable S3** → указать бакет `monflacon-backups`, endpoint `s3.eu-central-003.backblazeb2.com`, регион `eu-central-003`, ключи доступа B2.
3. Вкладка **Retention**: **30**.
4. Вкладка **Executions**: расписание (cron-выражение) `0 3 * * *`.
5. Сохранить, затем либо дождаться первого автозапуска по расписанию, либо нажать **Run** вручную сразу — и проверить, что в бакете `monflacon-backups` появился новый файл дампа с ненулевым размером.

## Настройка бэкапа медиа (`scripts/backup-media.sh`)

Скрипт уже в репозитории. Он ничего не запускает сам — cron-запись на сервере и env-файл с ключами B2 ставит владелец.

### Что делает скрипт (коротко)

1. Находит на хосте директорию, которую Docker примонтировал в контейнер приложения на `/app/media` (Coolify persistent volume) — **динамически**, через `docker inspect` по всем запущенным контейнерам. Id/имя контейнера не хардкодится: Coolify пересоздаёт контейнер приложения на каждом деплое с новым id.
2. Архивирует найденную директорию в `.tar.gz` в `/opt/backups/media` (переопределяется `BACKUP_DIR`).
3. Хранит последние `N` архивов локально (по умолчанию 14, `RETENTION`), старые удаляет.
4. Если задан `B2_REMOTE_PATH` — выгружает только что созданный архив в Backblaze B2 через `rclone` (backend `b2`) и отдельно ротирует архивы в бакете (по умолчанию тоже 14, `RETENTION_REMOTE`). Если `B2_REMOTE_PATH` пуст — этот шаг пропускается, это не ошибка.
5. Логирует в `$BACKUP_DIR/backup-media.log` и в stdout.
6. При любой ошибке (volume не найден, `tar` упал, неверно настроен `BACKUP_DIR`, сбой выгрузки в B2, отсутствующие при заданном `B2_REMOTE_PATH` ключи или `rclone`) — ненулевой exit code. Локальный архив, если он успел создаться, никуда не девается.

Полное описание параметров — в комментарии в шапке самого файла.

### Установка rclone на сервере

```bash
curl https://rclone.org/install.sh | sudo bash
rclone version
```

### Секреты B2 — `/etc/monflacon-backup.env`

Скрипт сам не хранит ключи — перед работой подхватывает файл по пути `ENV_FILE` (по умолчанию `/etc/monflacon-backup.env`), если он существует. Шаблон — `scripts/backup-media.env.example` в репозитории (только плейсхолдеры, реальный файл в git не идёт).

```bash
sudo cp /path/to/repo/scripts/backup-media.env.example /etc/monflacon-backup.env
sudo nano /etc/monflacon-backup.env   # вписать B2_KEY_ID / B2_APP_KEY, проверить B2_REMOTE_PATH
sudo chmod 600 /etc/monflacon-backup.env
sudo chown root:root /etc/monflacon-backup.env
```

Application Key для этого файла — отдельный, выданный на бакет `monflacon-backups`, Read and Write (создаётся в Backblaze B2 → Application Keys → Add a New Application Key).

### Установка на сервере

```bash
# Директория под архивы, вне докерных volume'ов
sudo mkdir -p /opt/backups/media

# Скрипт уже исполняемый в git, но на всякий случай:
chmod +x /path/to/repo/scripts/backup-media.sh
```

`/path/to/repo` — путь к копии репозитория на самом VPS. Coolify не гарантирует стабильный путь билд-контекста между деплоями (пересобирает в новую директорию), поэтому под cron-задачу надёжнее держать отдельный лёгкий чекаут (`git clone`, только для этого скрипта, обновляется вручную при изменении скрипта), а не указывать в cron путь внутрь рабочей директории Coolify.

### Cron-запись

От пользователя с доступом к Docker CLI (root, либо член группы `docker` — скрипту нужны `docker ps`/`docker inspect`):

```cron
0 4 * * * /usr/bin/env bash /path/to/repo/scripts/backup-media.sh >> /opt/backups/media/cron.log 2>&1
```

С нестандартными параметрами (директория/ротация, если нужно переопределить дефолты вне `/etc/monflacon-backup.env`):

```cron
0 4 * * * BACKUP_DIR=/opt/backups/media RETENTION=14 /usr/bin/env bash /path/to/repo/scripts/backup-media.sh >> /opt/backups/media/cron.log 2>&1
```

Секреты B2 (`B2_KEY_ID`, `B2_APP_KEY`) в cron-строку не выносятся — они лежат в `/etc/monflacon-backup.env`, который скрипт подхватывает сам. `B2_REMOTE_PATH` тоже удобнее держать в этом файле, а не в cron-строке.

Поставить: `crontab -e` (для root — `sudo crontab -e`), вставить строку, сохранить.

### Как проверить, что бэкап реально создался

```bash
# Список архивов, самый свежий должен быть с недавней меткой времени
ls -lh /opt/backups/media/

# Последние строки лога — там же итог: "готово: ...", "выгрузка в B2 завершена"
# и "бэкап медиа завершён успешно"
tail -20 /opt/backups/media/backup-media.log

# Архив не пустой и не битый — список файлов внутри
tar -tzf /opt/backups/media/media-<последний-таймстамп>.tar.gz | head

# Ручной прогон и проверка кода возврата
/usr/bin/env bash /path/to/repo/scripts/backup-media.sh; echo "exit code: $?"
```

Ненулевой `exit code` или отсутствие новых файлов в `ls` — сигнал разбираться (в первую очередь смотреть `backup-media.log`, там всегда есть строка с точной причиной).

### Как проверить, что архив долетел до B2

```bash
rclone lsf b2remote:monflacon-backups/media --files-only
```

(требует тех же переменных окружения `RCLONE_CONFIG_B2REMOTE_*`, что и сам скрипт выставляет внутри себя — проще всего прогнать эту команду как часть ручного прогона скрипта, добавив `set -x` временно, либо напрямую из `/etc/monflacon-backup.env`: `set -a; . /etc/monflacon-backup.env; set +a; RCLONE_CONFIG_B2REMOTE_TYPE=b2 RCLONE_CONFIG_B2REMOTE_ACCOUNT=$B2_KEY_ID RCLONE_CONFIG_B2REMOTE_KEY=$B2_APP_KEY rclone lsf b2remote:$B2_REMOTE_PATH --files-only`). Либо проще — зайти в саму консоль Backblaze B2 и посмотреть содержимое бакета глазами.

## Проверка восстановлением

Бэкап, который ни разу не разворачивали, бэкапом не считается. Пошаговая инструкция — `docs/restore-drill.md`. Пройти вживую один раз после первой настройки расписания, дальше — раз в месяц (см. `docs/STATE.md` → «Дальше — фаза 10»).
