import { Inter } from 'next/font/google'

/**
 * Inter — веб-замена Helvetica Neue из брендбука (BRAND.md §3).
 * Сабсеты: latin + latin-ext (румынские диакритики ă â î ș ț для RO-локали)
 * + cyrillic (RU). Переменный шрифт, веса 300/400/500 берутся из осей.
 *
 * next/font сам хостит файлы с нашего origin (без запросов к Google в рантайме),
 * `display: swap` + автоматический size-adjust фолбэка убирают CLS.
 * Значение попадает в CSS через --font-inter → --font-sans в tokens.css.
 */
export const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
})
