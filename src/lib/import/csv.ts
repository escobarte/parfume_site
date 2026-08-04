/**
 * Минимальный парсер CSV по RFC 4180 — без внешней зависимости.
 * Понимает кавычки, экранированные кавычки (""), переводы строк внутри полей,
 * CRLF и BOM. Разделитель определяется по первой строке: `,` или `;`
 * (Excel в ru/ro-локали сохраняет с точкой с запятой).
 */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'))
  const counts = {
    ',': (firstLine.match(/,/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as ',' | ';' | '\t') || ','
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const sep = delimiter ?? detectDelimiter(text)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === sep) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }

  // Пустые строки в конце файла игнорируем.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

export type CsvRecord = {
  /** Номер строки в файле как её видит клиент в Excel (1 — заголовок). */
  line: number
  data: Record<string, string>
}

export type CsvTable = {
  header: string[]
  records: CsvRecord[]
}

/** Заголовки приводятся к snake_case в нижнем регистре: «Old Price» → old_price. */
export const normalizeHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')

export function toTable(input: string): CsvTable {
  const rows = parseCsv(input)
  if (!rows.length) return { header: [], records: [] }

  const header = rows[0].map(normalizeHeader)

  const records = rows.slice(1).map((cells, index) => {
    const data: Record<string, string> = {}
    header.forEach((key, columnIndex) => {
      if (key) data[key] = (cells[columnIndex] ?? '').trim()
    })
    return { line: index + 2, data }
  })

  return { header, records }
}
