import type { APIRequestContext } from '@playwright/test'

/**
 * Баннеры главной через REST админа — для e2e карусели.
 *
 * Строка описывается сразу по всем локалям (картинки и `alt` — карты
 * `{ ro, ru, en }`), как её отдаёт `?locale=all`. Запись идёт по локалям
 * подряд, и тут две ловушки:
 * - строки массива пересоздаются на каждой записи, если не передать их id,
 *   и стирают значения предыдущей локали (docs/GOTCHAS.md, «Локализованные
 *   поля внутри массивов») — поэтому id снимаются после первой записи;
 * - новая строка без десктопной картинки в локали первой записи не пройдёт
 *   валидацию («картинка хотя бы на одном языке» проверяется по уже
 *   сохранённому документу) — поэтому первая запись ставит любую доступную
 *   десктопную временно, а последняя возвращает ro её настоящее значение.
 *
 * Все три слота (`image`, `imageTablet`, `imageMobile`) читаются и пишутся:
 * иначе возврат баннеров после теста молча стёр бы планшетные и мобильные.
 */

const LOCALES = ['ro', 'ru', 'en'] as const
type Locale = (typeof LOCALES)[number]
type PerLocale<T> = Partial<Record<Locale, T | null>>

const SLOTS = ['image', 'imageTablet', 'imageMobile'] as const

export type BannerInput = {
  enabled?: boolean
  image: PerLocale<number>
  imageTablet?: PerLocale<number>
  imageMobile?: PerLocale<number>
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
    const slots = Object.fromEntries(
      SLOTS.map((slot) => {
        const byLocale = (row[slot] ?? {}) as Record<string, unknown>
        return [slot, Object.fromEntries(LOCALES.map((locale) => [locale, idOf(byLocale[locale])]))]
      }),
    ) as Pick<BannerInput, (typeof SLOTS)[number]>
    return {
      enabled: row.enabled as boolean,
      ...slots,
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

  const localized = (banner: BannerInput, locale: Locale) => ({
    image: banner.image[locale] ?? null,
    imageTablet: banner.imageTablet?.[locale] ?? null,
    imageMobile: banner.imageMobile?.[locale] ?? null,
    alt: banner.alt?.[locale] ?? null,
  })

  const first = await post(
    'ro',
    banners.map((banner) => ({
      ...shared(banner),
      ...localized(banner, 'ro'),
      image: banner.image.ro ?? anyImage(banner),
    })),
  )
  const ids: string[] = (first.result?.heroBanners ?? []).map((row: { id: string }) => row.id)

  const rowsFor = (locale: Locale) =>
    banners.map((banner, index) => ({ id: ids[index], ...shared(banner), ...localized(banner, locale) }))

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
