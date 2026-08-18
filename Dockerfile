# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN corepack enable

# --- deps: полный набор (прод + dev) отдельным слоем для кэша — нужен build-стадии ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# --- prod-deps: только прод-зависимости, отдельный слой — идут в runner ради payload CLI.
# Standalone-трассировка Next (см. runner ниже) не тащит devDependencies, поэтому этот
# слой их тоже не ставит — тот же прод-набор, что и в deps, без лишнего веса. ---
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --prod --frozen-lockfile

# --- build: next build с output standalone ---
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# --- runner: прод-образ, non-root ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Явно — чтобы `payload migrate` не искал конфиг эвристикой по tsconfig.json
# в незнакомом контейнерном cwd, а брал ровно этот файл (см. docs/GOTCHAS.md).
ENV PAYLOAD_CONFIG_PATH=/app/src/payload.config.ts

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && chown nextjs:nodejs /app
# `/app` иначе остаётся root:root (создан WORKDIR ещё до useradd) — рантайм-
# запись под nextjs (сид кладёт временные плейсхолдеры в `.seed-tmp/`, см.
# ниже) иначе падает EACCES при mkdir прямо под /app.

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# Standalone-трассировка Next включает только тот срез node_modules, который
# нужен серверу (`node server.js`) — CLI `payload` (bin.js) в этот граф импортов
# не попадает, поэтому `payload migrate` внутри контейнера падал MODULE_NOT_FOUND.
# Полный прод-набор поверх трассированного среза — строгое надмножество тех же
# версий (один и тот же lock-файл), серверу не мешает, CLI даёт всё нужное.
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
# `payload` CLI транспилирует TypeScript на лету через встроенный tsx (см.
# docs/GOTCHAS.md) — но самих исходников payload.config.ts/миграций/коллекций
# standalone-сборка не содержит (она держит только скомпилированный вывод для
# Next.js). Нужны реальные файлы — копируем src целиком (миграции, config,
# коллекции, access) и tsconfig.json (алиас `@/*` и `@payload-config`).
COPY --from=build --chown=nextjs:nodejs /app/src ./src
COPY --from=build --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# `scripts/` (seed/import) не нужен старту контейнера, но должен остаться
# вручную запускаемым внутри деплоя: `./node_modules/.bin/tsx scripts/seed.ts`
# (НЕ `pnpm seed` — corepack в этом non-root образе не может скачать/закэшировать
# pnpm при первом вызове без домашней директории, см. docs/GOTCHAS.md; прямой
# вызов tsx обходит corepack целиком и не зависит от сети рантайма). Сид НЕ
# входит в docker-entrypoint.sh намеренно, чтобы не перезатирать прод-данные.
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
