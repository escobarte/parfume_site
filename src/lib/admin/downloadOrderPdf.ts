/**
 * Скачивание печатной версии заявки — общее для карточки и списка заявок.
 *
 * В отличие от CSV (лежит текстом прямо в документе, см. downloadCsv.ts) PDF
 * собирается сервером по запросу: эндпойнт `/api/orders/:id/pdf` коллекции
 * Orders. `credentials: 'include'` обязателен — доступ проверяется по той же
 * куке админки, что и всё остальное.
 *
 * Возвращает текст ошибки для показа пользователю или `null` при успехе:
 * бросать исключение из обработчика клика некому ловить.
 */
export async function downloadOrderPdf(
  id: string | number,
  orderNumber?: string | null,
): Promise<string | null> {
  try {
    const response = await fetch(`/api/orders/${id}/pdf`, { credentials: 'include' })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return 'Нет доступа к файлу заявки'
      return `Не удалось собрать PDF (HTTP ${response.status})`
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${orderNumber ?? 'order'}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return null
  } catch (error) {
    return `Не удалось скачать PDF: ${error instanceof Error ? error.message : String(error)}`
  }
}
