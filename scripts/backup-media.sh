#!/usr/bin/env bash
#
# backup-media.sh — бэкап persistent volume /app/media (Coolify, прод VPS)
#
# Что делает:
#   1. Находит на ХОСТЕ директорию, которую Docker примонтировал в контейнер
#      приложения как /app/media — динамически, через `docker inspect` по
#      всем запущенным контейнерам (ищет Mount с Destination == /app/media).
#      Id/имя контейнера НЕ хардкодится: Coolify пересоздаёт контейнер
#      приложения на каждом деплое с новым id.
#   2. Архивирует найденную директорию (.tar.gz) в директорию ВНЕ докерных
#      volume'ов (по умолчанию /opt/backups/media).
#   3. Ротация локально — хранит N последних архивов (по умолчанию 14), старые
#      удаляет.
#   4. Опционально — выгружает только что созданный архив в Backblaze B2
#      через rclone (нативный backend `b2`, не s3-совместимый) и отдельно
#      ротирует архивы в бакете.
#   5. Логирует результат (stdout + лог-файл в BACKUP_DIR).
#   6. При любой ошибке — ненулевой exit code. Локальная ротация и выгрузка в
#      B2 не запускаются, если архивирование не удалось.
#
# Запуск — на сервере (VPS), через cron, от пользователя с доступом к Docker
# (root либо член группы docker — нужен для `docker ps`/`docker inspect`).
# Пример cron-строки и порядок установки — docs/backup.md.
#
# Секреты НЕ хранятся в этом файле и не передаются через cron-строку. Перед
# началом работы скрипт подхватывает (если есть) файл с переменными:
#   ENV_FILE — путь к env-файлу с секретами    (по умолчанию /etc/monflacon-backup.env)
# Сам файл в репозиторий не добавляется — см. шаблон scripts/backup-media.env.example.
#
# Параметры (env-переменные, у всех есть дефолт, кроме B2_KEY_ID/B2_APP_KEY):
#   BACKUP_DIR        — куда класть архивы            (по умолчанию /opt/backups/media)
#   RETENTION         — сколько последних архивов хранить локально (по умолчанию 14)
#   MEDIA_DEST        — destination-путь внутри контейнера, по которому ищем volume
#                        (по умолчанию /app/media)
#   LOG_FILE          — путь к лог-файлу              (по умолчанию $BACKUP_DIR/backup-media.log)
#   B2_REMOTE_PATH    — путь в бакете B2 для выгрузки, например
#                        monflacon-backups/media. Пусто (по умолчанию) =
#                        выгрузка во внешнее хранилище пропускается, это не
#                        ошибка — только строка в лог.
#   B2_KEY_ID         — keyID application key из Backblaze B2 (без дефолта)
#   B2_APP_KEY        — applicationKey из Backblaze B2 (без дефолта)
#   RETENTION_REMOTE  — сколько архивов хранить в B2  (по умолчанию = RETENTION)
#
# Если B2_REMOTE_PATH задан без одной из пары B2_KEY_ID/B2_APP_KEY (или
# наоборот) — это ошибка (ненулевой exit), а не тихий пропуск выгрузки.
# Если B2_REMOTE_PATH задан, а `rclone` не найден в PATH — тоже ошибка
# (скрипт сам rclone не ставит, см. docs/backup.md).
#
# Использование:
#   ./scripts/backup-media.sh
#   BACKUP_DIR=/mnt/backups RETENTION=30 ./scripts/backup-media.sh

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/monflacon-backup.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/media}"
RETENTION="${RETENTION:-14}"
MEDIA_DEST="${MEDIA_DEST:-/app/media}"
LOG_FILE="${LOG_FILE:-${BACKUP_DIR}/backup-media.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/backup-media.lock}"
B2_REMOTE_PATH="${B2_REMOTE_PATH:-}"
B2_KEY_ID="${B2_KEY_ID:-}"
B2_APP_KEY="${B2_APP_KEY:-}"
RETENTION_REMOTE="${RETENTION_REMOTE:-$RETENTION}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_NAME="media-${TIMESTAMP}.tar.gz"

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  # BACKUP_DIR может ещё не существовать в момент самой первой строки лога —
  # тогда пишем только в stdout, mkdir ниже создаст директорию для остального.
  [ -d "$BACKUP_DIR" ] && echo "$line" >>"$LOG_FILE"
  return 0
}

fail() {
  log "ОШИБКА: $*"
  exit 1
}

# Директория бэкапов не должна сама лежать внутри докерного volume-хранилища —
# иначе архивы физически окажутся там же, откуда бэкапятся (или в другом
# volume, но всё ещё "внутри Docker", что не даёт независимости при поломке
# Docker-стораджа). Проверка статическая, до discovery volume'а.
case "$BACKUP_DIR" in
  /var/lib/docker/*)
    fail "BACKUP_DIR (${BACKUP_DIR}) указывает внутрь /var/lib/docker — так нельзя, нужна директория вне докерных volume'ов"
    ;;
esac

mkdir -p "$BACKUP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  fail "уже выполняется другой запуск этого скрипта (lock: ${LOCK_FILE})"
fi

trap 'rm -f "${BACKUP_DIR}/.${ARCHIVE_NAME}.tmp"' EXIT

command -v docker >/dev/null 2>&1 || fail "docker не найден в PATH — запускать от юзера с доступом к Docker CLI"

log "поиск запущенного контейнера с volume, примонтированным в ${MEDIA_DEST}..."

MEDIA_HOST_PATH=""
MATCHES=0
for cid in $(docker ps -q); do
  src="$(docker inspect -f '{{ range .Mounts }}{{ if eq .Destination "'"${MEDIA_DEST}"'" }}{{ .Source }}{{ end }}{{ end }}' "$cid" 2>/dev/null || true)"
  if [ -n "$src" ]; then
    MEDIA_HOST_PATH="$src"
    MATCHES=$((MATCHES + 1))
  fi
done

[ "$MATCHES" -gt 0 ] || fail "ни один запущенный контейнер не монтирует ${MEDIA_DEST} — проверь, что приложение задеплоено и persistent volume подключён в Coolify"
if [ "$MATCHES" -gt 1 ]; then
  log "внимание: найдено ${MATCHES} совпадений (вероятно, идёт деплой и старый+новый контейнер работают одновременно) — используется последнее найденное: ${MEDIA_HOST_PATH}"
fi

[ -d "$MEDIA_HOST_PATH" ] || fail "путь на хосте не существует или не директория: ${MEDIA_HOST_PATH}"

file_count="$(find "$MEDIA_HOST_PATH" -type f | wc -l)"
log "volume найден: ${MEDIA_HOST_PATH} (${file_count} файлов)"
[ "$file_count" -gt 0 ] || log "внимание: директория медиа пуста — архив будет создан, но проверь, что это ожидаемо"

TMP_ARCHIVE="${BACKUP_DIR}/.${ARCHIVE_NAME}.tmp"
FINAL_ARCHIVE="${BACKUP_DIR}/${ARCHIVE_NAME}"

log "архивирование в ${FINAL_ARCHIVE}..."
if ! tar -czf "$TMP_ARCHIVE" -C "$(dirname "$MEDIA_HOST_PATH")" "$(basename "$MEDIA_HOST_PATH")"; then
  fail "tar завершился с ошибкой"
fi
mv "$TMP_ARCHIVE" "$FINAL_ARCHIVE"

archive_size="$(du -h "$FINAL_ARCHIVE" | cut -f1)"
log "готово: ${FINAL_ARCHIVE} (${archive_size})"

log "ротация: храним последние ${RETENTION} архивов..."
mapfile -t archives < <(find "$BACKUP_DIR" -maxdepth 1 -name 'media-*.tar.gz' -printf '%T@ %p\n' | sort -rn | awk '{print $2}')
removed=0
if [ "${#archives[@]}" -gt "$RETENTION" ]; then
  for old in "${archives[@]:$RETENTION}"; do
    log "удаляю устаревший архив: ${old}"
    rm -f "$old"
    removed=$((removed + 1))
  done
fi
kept=$((${#archives[@]} - removed))

log "бэкап медиа завершён успешно: архив создан, ${kept} архивов в ${BACKUP_DIR} после ротации (лимит ${RETENTION})"

# ---------------------------------------------------------------------------
# Выгрузка в Backblaze B2 (rclone, backend b2). Опционально — включается
# непустым B2_REMOTE_PATH. Выгружается только что созданный архив, не вся
# директория; ротация в бакете — отдельно от локальной.
#
# Конфиг rclone передаётся ТОЛЬКО через переменные окружения
# (RCLONE_CONFIG_B2REMOTE_*), без ~/.rclone.conf и без `rclone config` — на
# сервере не должно быть второго места с секретами, кроме ENV_FILE.
#
# hard_delete=true обязателен: у бакета включено версионирование
# "Keep all versions", и без hard_delete обычное удаление лишь прячет версию
# (hide marker), не освобождая место — ротация в бакете тогда ничего не
# удаляла бы по факту (см. docs/GOTCHAS.md).
# ---------------------------------------------------------------------------
if [ -z "$B2_REMOTE_PATH" ]; then
  if [ -n "$B2_KEY_ID" ] || [ -n "$B2_APP_KEY" ]; then
    fail "B2_KEY_ID/B2_APP_KEY заданы, а B2_REMOTE_PATH пуст — укажи B2_REMOTE_PATH или очисти ключи"
  fi
  log "B2_REMOTE_PATH не задан — выгрузка во внешнее хранилище пропущена"
else
  command -v rclone >/dev/null 2>&1 || fail "rclone не найден в PATH, а B2_REMOTE_PATH задан — установи rclone (docs/backup.md) или очисти B2_REMOTE_PATH"
  [ -n "$B2_KEY_ID" ] || fail "B2_REMOTE_PATH задан, но B2_KEY_ID пуст"
  [ -n "$B2_APP_KEY" ] || fail "B2_REMOTE_PATH задан, но B2_APP_KEY пуст"

  export RCLONE_CONFIG_B2REMOTE_TYPE="b2"
  export RCLONE_CONFIG_B2REMOTE_ACCOUNT="$B2_KEY_ID"
  export RCLONE_CONFIG_B2REMOTE_KEY="$B2_APP_KEY"
  export RCLONE_CONFIG_B2REMOTE_HARD_DELETE="true"

  log "выгрузка ${FINAL_ARCHIVE} в b2remote:${B2_REMOTE_PATH}..."
  if ! rclone copy "$FINAL_ARCHIVE" "b2remote:${B2_REMOTE_PATH}/" --no-traverse; then
    fail "rclone copy в B2 завершился с ошибкой — локальный архив на месте, внешней копии нет"
  fi
  log "выгрузка в B2 завершена"

  log "ротация в B2: храним последние ${RETENTION_REMOTE} архивов..."
  mapfile -t remote_archives < <(rclone lsf "b2remote:${B2_REMOTE_PATH}" --files-only | grep -E '^media-.*\.tar\.gz$' | sort -r)
  remote_removed=0
  if [ "${#remote_archives[@]}" -gt "$RETENTION_REMOTE" ]; then
    for old in "${remote_archives[@]:$RETENTION_REMOTE}"; do
      log "удаляю устаревший архив в B2: ${old}"
      if ! rclone deletefile "b2remote:${B2_REMOTE_PATH}/${old}"; then
        fail "не удалось удалить устаревший архив в B2: ${old}"
      fi
      remote_removed=$((remote_removed + 1))
    done
  fi
  remote_kept=$((${#remote_archives[@]} - remote_removed))
  log "ротация в B2 завершена: ${remote_kept} архивов после ротации (лимит ${RETENTION_REMOTE})"
fi

exit 0
