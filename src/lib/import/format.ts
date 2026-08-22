/** Список через запятую с обрезкой для длинных отчётов — используется CSV- и ZIP-отчётами. */
export const list = (items: string[], limit = 12): string =>
  items.length <= limit
    ? items.join(', ')
    : `${items.slice(0, limit).join(', ')} … и ещё ${items.length - limit}`
