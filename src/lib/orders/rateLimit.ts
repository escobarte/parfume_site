/**
 * Простой лимит по IP: не больше N заявок за окно.
 *
 * Счётчик в памяти процесса — этого достаточно, пока приложение крутится
 * одним контейнером (так и задумано в PLAN.md §11). Появятся реплики —
 * переносить в Redis или в БД.
 */
const WINDOW_MS = 10 * 60 * 1000
/** Порог выносим в env: удобно поднять на прогонах проверок и подкрутить на проде. */
const MAX_REQUESTS = Number(process.env.ORDERS_RATE_LIMIT ?? 5)

const hits = new Map<string, number[]>()

/**
 * `scope` разводит независимые счётчики по IP на разные endpoint'ы (форма
 * заявки и, с фазы 4.7.2, поиск заказа по номеру+телефону) — иначе один
 * общий счётчик позволил бы легитимным заявкам выедать лимит поиска и
 * наоборот. Дефолт без scope не меняет поведение формы заявки (фаза 4.2).
 */
export function checkRateLimit(
  ip: string,
  scope = 'default',
): { allowed: boolean; retryAfter: number } {
  const key = `${scope}:${ip}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS)

  if (recent.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)
    hits.set(key, recent)
    return { allowed: false, retryAfter }
  }

  recent.push(now)
  hits.set(key, recent)

  // Чтобы карта не росла бесконечно на длинных прогонах.
  if (hits.size > 5000) {
    for (const [mapKey, times] of hits) {
      if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(mapKey)
    }
  }

  return { allowed: true, retryAfter: 0 }
}

/** IP за прокси (Cloudflare/Traefik) — из заголовков, иначе неизвестен. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return (
    request.headers.get('cf-connecting-ip') ??
    (forwarded ? forwarded.split(',')[0].trim() : null) ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
