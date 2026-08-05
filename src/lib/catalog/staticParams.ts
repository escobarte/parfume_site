/**
 * Сбор путей для generateStaticParams.
 *
 * Образ собирается без доступа к БД (в Coolify билд идёт до старта Postgres),
 * поэтому запрос к Payload на этапе сборки может не выполниться. Тогда вместо
 * падения возвращаем пустой список: страницы отрендерятся по первому запросу
 * и осядут в кэше с теми же тегами ревалидации.
 */
export async function staticParamsOrEmpty<T>(load: () => Promise<T[]>): Promise<T[]> {
  if (!process.env.DATABASE_URI || !process.env.PAYLOAD_SECRET) return []
  try {
    return await load()
  } catch (error) {
    console.warn('[generateStaticParams] БД недоступна на сборке, пути соберутся в рантайме', error)
    return []
  }
}
