import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

/**
 * Заводит/удаляет документ `Pages` через Local API В ОТДЕЛЬНОМ процессе —
 * не через REST запущенного dev-сервера. Так e2e воспроизводит ровно тот
 * сценарий из `docs/GOTCHAS.md` («закэшированный null у getPageBySlug»),
 * из-за которого `getPageBySlug` больше не кэширует промах: правка из CLI/
 * скрипта не долетает `revalidateTag`'ом до уже запущенного процесса
 * dev-сервера, поэтому единственная защита от зависшего 404 — не класть
 * промах в кэш вообще (см. `src/lib/content/pages.ts`).
 *
 * Запускается через `./node_modules/.bin/tsx` (не `pnpm tsx` —
 * `NODE_OPTIONS=--import=tsx/esm` ломает pnpm на `.pnpmfile.mjs`, см. GOTCHAS).
 */
async function main() {
  const [, , cmd, slug, title] = process.argv
  if (!cmd || !slug) throw new Error('usage: pagesCliScript.ts <create|delete> <slug> [title]')

  const payload = await getPayload({ config })

  if (cmd === 'create') {
    const doc = await payload.create({
      collection: 'pages',
      data: { title: title ?? slug, slug },
    })
    process.stdout.write(JSON.stringify({ id: doc.id }))
  } else if (cmd === 'delete') {
    const { docs } = await payload.find({
      collection: 'pages',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })
    if (docs[0]) await payload.delete({ collection: 'pages', id: docs[0].id })
    process.stdout.write(JSON.stringify({ deleted: Boolean(docs[0]) }))
  } else {
    throw new Error(`unknown cmd: ${cmd}`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
