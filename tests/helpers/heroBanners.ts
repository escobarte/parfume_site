import type { APIRequestContext } from '@playwright/test'

/**
 * Баннеры главной через REST админа — для e2e карусели.
 *
 * Строка описывается сразу по всем локалям (`image`/`alt` — карты
 * `{ ro, ru, en }`), как её отдаёт `?locale=all`. Запись идёт по локалям
 * подряд, и тут две ловушки:
 * - строки массива пересоздаются на каждой записи, если не передать их id,
 *   и стирают значения предыдущей локали (docs/GOTCHAS.md, «Локализованные
 *   поля внутри массивов») — поэтому id снимаются после первой записи;
 * - новая строка без картинки в локали первой записи не пройдёт валидацию
 *   («картинка хотя бы на одном языке» проверяется по уже сохранённому
 *   документу) — поэтому первая запись ставит любую доступную картинку
 *   временно, а последняя возвращает ro её настоящее значение.
 */

const LOCALES = ['ro', 'ru', 'en'] as const
type Locale = (typeof LOCALES)[number]
type PerLocale<T> = Partial<Record<Locale, T | null>>

export type BannerInput = {
  enabled?: boolean
  image: PerLocale<number>
  alt?: PerLocale<string>
  linkMode?: 'system' | 'page'
  link?: string | null
  linkPage?: number | null
  linkOverride?: string | null
}

export async function adminToken(request: APIRequestContext, baseURL: string) {
  const login = await request.post(`${baseURL}/api/users/login`, {
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  })
  const { token } = await login.json()
  return token as string
}

const auth = (token: string) => ({ Authorization: `JWT ${token}` })

const idOf = (value: unknown): number | null =>
  typeof value === 'number'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? Number((value as { id: number }).id)
      : null

/** Текущие баннеры в форме `BannerInput` — чтобы вернуть их после теста. */
export async function readBanners(
  request: APIRequestContext,
  baseURL: string,
  token: string,
): Promise<BannerInput[]> {
  const homepage = await request
    .get(`${baseURL}/api/globals/homepage?locale=all&depth=0`, { headers: auth(token) })
    .then((response) => response.json())

  return (homepage.heroBanners ?? []).map((row: Record<string, unknown>) => {
    const image = (row.image ?? {}) as Record<string, unknown>
    return {
      enabled: row.enabled as boolean,
      image: Object.fromEntries(LOCALES.map((locale) => [locale, idOf(image[locale])])),
      alt: (row.alt ?? {}) as PerLocale<string>,
      linkMode: (row.linkMode as 'system' | 'page') ?? 'system',
      link: (row.link as string) ?? null,
      linkPage: idOf(row.linkPage),
      linkOverride: (row.linkOverride as string) ?? null,
    }
  })
}

export async function writeBanners(
  request: APIRequestContext,
  baseURL: string,
  token: string,
  banners: BannerInput[],
) {
  const post = async (locale: Locale, rows: Record<string, unknown>[]) => {
    const response = await request.post(`${baseURL}/api/globals/homepage?locale=${locale}`, {
      headers: auth(token),
      data: { heroBanners: rows },
    })
    if (!response.ok()) {
      throw new Error(`homepage ${locale}: ${response.status()} ${await response.text()}`)
    }
    return response.json()
  }

  const anyImage = (banner: BannerInput) =>
    LOCALES.map((locale) => banner.image[locale]).find((id) => typeof id === 'number') ?? null

  const shared = (banner: BannerInput) => ({
    enabled: banner.enabled ?? true,
    linkMode: banner.linkMode ?? 'system',
    link: banner.link ?? null,
    linkPage: banner.linkPage ?? null,
    linkOverride: banner.linkOverride ?? null,
  })

  const first = await post(
    'ro',
    banners.map((banner) => ({
      ...shared(banner),
      image: banner.image.ro ?? anyImage(banner),
      alt: banner.alt?.ro ?? null,
    })),
  )
  const ids: string[] = (first.result?.heroBanners ?? []).map((row: { id: string }) => row.id)

  const rowsFor = (locale: Locale) =>
    banners.map((banner, index) => ({
      id: ids[index],
      ...shared(banner),
      image: banner.image[locale] ?? null,
      alt: banner.alt?.[locale] ?? null,
    }))

  await post('ru', rowsFor('ru'))
  await post('en', rowsFor('en'))
  await post('ro', rowsFor('ro'))
}

export async function uploadMedia(
  request: APIRequestContext,
  baseURL: string,
  token: string,
  name: string,
  buffer: Buffer,
) {
  const response = await request.post(`${baseURL}/api/media?locale=ro`, {
    headers: auth(token),
    multipart: {
      file: { name, mimeType: 'image/png', buffer },
      _payload: JSON.stringify({ alt: name }),
    },
  })
  if (!response.ok()) throw new Error(`media ${name}: ${response.status()} ${await response.text()}`)
  const { doc } = await response.json()
  return doc as { id: number; filename: string }
}

export async function deleteMedia(
  request: APIRequestContext,
  baseURL: string,
  token: string,
  id: number,
) {
  await request.delete(`${baseURL}/api/media/${id}`, { headers: auth(token) })
}
