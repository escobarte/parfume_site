import 'dotenv/config'
import { readFile } from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import config from '../src/payload.config.js'
import { runImport } from '../src/lib/import/engine.js'
import { formatReport } from '../src/lib/import/report.js'

const USAGE = `
Импорт каталога из CSV.

  pnpm import <файл.csv> [--dry-run] [--locale=ro|ru|en]

Форматы определяются по заголовку автоматически:
  handle,title,brand,…,volume,sku,price,stock   — формат A (строка = вариант)
  handle,title,brand,…,variants                 — формат B (варианты JSON-колонкой)
  sku,price,stock                               — лёгкий прайс
  handle,locale,title,description               — переводы

Шаблон с примером: docs/import-template.csv
`

async function main() {
  const args = process.argv.slice(2)
  const file = args.find((arg) => !arg.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  const locale = args.find((arg) => arg.startsWith('--locale='))?.split('=')[1]

  if (!file) {
    console.log(USAGE)
    process.exit(1)
  }

  const csvText = await readFile(path.resolve(process.cwd(), file), 'utf8')
  const payload = await getPayload({ config })

  const result = await runImport(payload, csvText, { dryRun, locale })

  console.log('')
  console.log(formatReport(result))
  console.log('')

  process.exit(result.ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
