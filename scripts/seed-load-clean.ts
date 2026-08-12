import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config.js'

/** Откат `pnpm seed:load` (PLAN.md §8.3): удаляет `load-NNN` и общую плейсхолдер-картинку. */
async function main() {
  const payload = await getPayload({ config })

  const del = await payload.delete({
    collection: 'products',
    where: { slug: { like: 'load-' } },
  })
  payload.logger.info(`Удалено товаров: ${del.docs.length}`)

  const media = await payload.find({
    collection: 'media',
    where: { filename: { equals: 'load-placeholder.png' } },
    limit: 1,
    depth: 0,
  })
  if (media.docs[0]) {
    await payload.delete({ collection: 'media', id: media.docs[0].id })
    payload.logger.info('Удалена плейсхолдер-картинка')
  }

  const { totalDocs } = await payload.count({ collection: 'products' })
  payload.logger.info(`Осталось товаров: ${totalDocs}`)
  process.exit(0)
}

main()
