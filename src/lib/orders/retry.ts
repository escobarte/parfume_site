/**
 * Общий ретрай-обвес над `fetch` для уведомлений о заявке (Resend, Telegram).
 *
 * Правило одно на оба канала: сетевой сбой (fetch кинул исключение — DNS,
 * обрыв соединения, таймаут) и ответы 429/5xx — повторяем; любой другой 4xx
 * (401/403/404/422...) — ошибка клиента, повтор ничего не изменит, отдаём
 * как есть с первой попытки. Три попытки, пауза между ними нарастает
 * (дефолт 1с → 3с — после третьей попытки больше не ждём).
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type RetryOutcome =
  | { kind: 'response'; response: Response; attempts: number }
  | { kind: 'network-error'; error: unknown; attempts: number }

export type RetryOptions = {
  /** Сколько раз пробовать всего (не «повторов», а попыток), по умолчанию 3. */
  maxAttempts?: number
  /** Пауза ПЕРЕД следующей попыткой — элемент [i] ждём после попытки i+1. */
  backoffMs?: number[]
  /** Таймаут одного запроса — отдельно от суммарной паузы между попытками. */
  timeoutMs?: number
  /** Какие HTTP-статусы считать временным сбоем (по умолчанию 429 и 5xx). */
  retryStatus?: (status: number) => boolean
}

const defaultRetryStatus = (status: number) => status === 429 || status >= 500

/**
 * Делает до `maxAttempts` попыток одного и того же запроса (`init` переиспользуется
 * как есть — вызывающий код сам отвечает за то, чтобы тело запроса было
 * одинаковым на каждой попытке, это и есть предпосылка идемпотентности).
 * Никогда не бросает исключение — последняя неудача возвращается значением.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<RetryOutcome> {
  const maxAttempts = options.maxAttempts ?? 3
  const backoffMs = options.backoffMs ?? [1000, 3000]
  const timeoutMs = options.timeoutMs ?? 10_000
  const retryStatus = options.retryStatus ?? defaultRetryStatus

  let lastError: unknown
  let lastResponse: Response | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (response.ok || !retryStatus(response.status) || attempt === maxAttempts) {
        return { kind: 'response', response, attempts: attempt }
      }
      lastResponse = response
    } catch (error) {
      if (attempt === maxAttempts) {
        return { kind: 'network-error', error, attempts: attempt }
      }
      lastError = error
    }

    await sleep(backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 1000)
  }

  // Недостижимо при maxAttempts >= 1 (цикл выше всегда возвращает на последней
  // попытке) — ветка только чтобы TS не требовал undefined-возврат.
  if (lastResponse) return { kind: 'response', response: lastResponse, attempts: maxAttempts }
  return { kind: 'network-error', error: lastError, attempts: maxAttempts }
}
