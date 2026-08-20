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
#   3. Ротация — хранит N последних архивов (по умолчанию 14), старые удаляет.
#   4. Логирует результат (stdout + лог-файл в BACKUP_DIR).
#   5. При любой ошибке — ненулевой exit code, ротация не запускается.
#
# Запуск — на сервере (VPS), через cron, от пользователя с доступом к Docker
# (root либо член группы docker — нужен для `docker ps`/`docker inspect`).
# Пример cron-строки и порядок установки — docs/backup.md.
#
# Параметры (env-переменные, у всех есть дефолт):
#   BACKUP_DIR — куда класть архивы            (по умолчанию /opt/backups/media)
#   RETENTION  — сколько последних архивов хранить (по умолчанию 14)
#   MEDIA_DEST — destination-путь внутри контейнера, по которому ищем volume
#                (по умолчанию /app/media)
#   LOG_FILE   — путь к лог-файлу              (по умолчанию $BACKUP_DIR/backup-media.log)
#
# Использование:
#   ./scripts/backup-media.sh
#   BACKUP_DIR=/mnt/backups RETENTION=30 ./scripts/backup-media.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/media}"
RETENTION="${RETENTION:-14}"
MEDIA_DEST="${MEDIA_DEST:-/app/media}"
LOG_FILE="${LOG_FILE:-${BACKUP_DIR}/backup-media.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/backup-media.lock}"
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
# ОПЦИОНАЛЬНО: зеркалирование архива на внешний хост по SSH (rsync).
#
# Сейчас закомментировано — внешнего хранилища для медиа НЕТ (Cloudflare R2
# в проекте не подключался, см. docs/STATE.md → раздел «Фаза 9»). Весь бэкап
# пока живёт на том же VPS, что и прод — это единственный открытый риск,
# который этот блок закрывает, когда появится второй хост.
#
# Чтобы включить, когда появится внешнее SSH-доступное хранилище (второй VPS,
# NAS, любой сервер с SSH):
#
#   1. Сгенерировать ОТДЕЛЬНЫЙ SSH-ключ без пароля специально под бэкапы
#      (не переиспользовать личный ключ владельца):
#        ssh-keygen -t ed25519 -f ~/.ssh/backup_media_id_ed25519 -N ""
#      и добавить публичный ключ в ~/.ssh/authorized_keys на внешнем хосте
#      для пользователя REMOTE_USER.
#   2. Подставить ниже реальные значения вместо CHANGEME:
#        REMOTE_USER — пользователь на внешнем хосте (например backup)
#        REMOTE_HOST — адрес внешнего хоста (IP или домен)
#        REMOTE_PATH — существующая директория на внешнем хосте
#   3. Раскомментировать блок целиком (включая переменные).
#
# REMOTE_USER="CHANGEME_backup_user"
# REMOTE_HOST="CHANGEME_backup_host"
# REMOTE_PATH="CHANGEME_/path/on/remote/host"
# SSH_KEY="${SSH_KEY:-$HOME/.ssh/backup_media_id_ed25519}"
#
# log "зеркалирование ${BACKUP_DIR} на ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}..."
# if ! rsync -az --delete \
#     -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new" \
#     "${BACKUP_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/"; then
#   fail "rsync на внешний хост завершился с ошибкой"
# fi
# log "зеркалирование на внешний хост завершено"
# ---------------------------------------------------------------------------

exit 0
