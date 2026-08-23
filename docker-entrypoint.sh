#!/bin/sh
set -e

# Coolify монтирует persistent volume в /app/media. Docker создаёт точку
# монтирования от root ДО того, как контейнер переключается на nextjs —
# монтирование происходит при старте контейнера, позже сборки образа, и
# затирает владельца обратно на root:root (755). chown в Dockerfile тут не
# спасает: он применяется на этапе сборки, до появления точки монтирования.
# Итог без этого блока — EACCES при любой загрузке в Media (см. GOTCHAS.md,
# «Non-root `nextjs`...», продолжение записи).
#
# Решение: контейнер стартует под root (см. Dockerfile — USER nextjs снят
# намеренно, не по недосмотру), сам процесс приложения — нет: если entrypoint
# видит, что он root, чинит владельца /app/media и СРАЗУ сбрасывает права на
# nextjs через setpriv (execve, не подпроцесс — тот же PID, сигналы и exit
# code пробрасываются как обычно) и рекурсивно перезапускает себя тем же
# путём — второй проход этого же скрипта увидит uid nextjs и пойдёт по
# нижней ветке. setpriv — из util-linux, уже есть в node:22-bookworm-slim,
# доустанавливать gosu/su-exec не пришлось.
#
# Идемпотентно: при каждом старте контейнер получает root (см. Dockerfile),
# так что этот блок отрабатывает каждый раз — mkdir -p и chown -R на уже
# верных правах молча no-op, ничего не падает и не дублируется.
if [ "$(id -u)" = "0" ]; then
  echo "[entrypoint] running as root — fixing ownership of /app/media..."
  mkdir -p /app/media
  chown -R nextjs:nodejs /app/media

  echo "[entrypoint] dropping privileges to nextjs..."
  exec setpriv --reuid=nextjs --regid=nodejs --init-groups --no-new-privs \
    /app/docker-entrypoint.sh "$@"
fi

echo "[entrypoint] applying Payload migrations..."
node node_modules/payload/bin.js migrate

echo "[entrypoint] migrations up to date, starting app..."
exec "$@"
