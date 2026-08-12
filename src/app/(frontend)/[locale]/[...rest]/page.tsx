import { notFound } from 'next/navigation'

/**
 * Ловит любой путь под `/[locale]/...`, не совпавший ни с одним реальным
 * маршрутом (опечатка в адресе, устаревшая ссылка). Next.js не подключает
 * вложенный `not-found.tsx` к сегменту сам по себе — только к явному
 * вызову `notFound()` внутри дерева совпавшего маршрута (документированный
 * паттерн next-intl «catching unknown routes within a locale»). Без этого
 * catch-all такие пути уходили бы в дефолтный (не брендированный) 404 Next.js
 * в обход `[locale]/not-found.tsx`.
 */
export default function CatchAll() {
  notFound()
}
