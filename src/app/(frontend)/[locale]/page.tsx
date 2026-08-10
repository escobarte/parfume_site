import { setRequestLocale } from 'next-intl/server'
import { Hero } from '@/components/home/Hero'
import type { Locale } from '@/i18n/routing'

// Остальные секции главной (лента категорий, новинки, editorial, бренд-строка)
// собираются в фазе 5 строго по WIREFRAMES.md §Главная и мокапу. Hero уже
// подключён к CMS в фазе 4.5 — на нём завязана акционная подмена по датам.
export default async function HomePage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  return <Hero locale={locale} />
}
