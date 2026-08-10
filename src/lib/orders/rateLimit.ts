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

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < WINDOW_MS)

  if (recent.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)
    hits.set(ip, recent)
    return { allowed: false, retryAfter }
  }

  recent.push(now)
  hits.set(ip, recent)

  // Чтобы карта не росла бесконечно на длинных прогонах.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(key)
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
