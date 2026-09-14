import type { Endpoint } from 'payload'
import { isAdmin } from '@/access/roles'
import { CampaignError, startCampaign, stopCampaign } from '@/lib/campaigns/run'

/**
 * Кнопки «Запустить» / «Остановить» кампании скидок (2026-09-12).
 *
 * Пути — вне пространства коллекций (`/api/<slug>`), как импорт и сброс кэша:
 * см. docs/GOTCHAS.md «Роуты и API». Операция затрагивает сразу products и
 * саму кампанию, ни к одной коллекции персонально не привязана, а статический
 * роут под `/api/discount-campaigns/...` перекрыл бы REST самой коллекции.
 *
 * Только роль admin: это массовая правка цен всего каталога. Менеджер
 * кампании видит (цены в заказах надо чем-то объяснять), но не запускает.
 */

const forbidden = () => new Response('Forbidden', { status: 403 })

const badRequest = (message: string) => Response.json({ ok: false, message }, { status: 400 })

/** Тело обеих кнопок одинаковое: `{ id }` редактируемой кампании. */
async function campaignId(req: Parameters<Endpoint['handler']>[0]): Promise<string | number | null> {
  if (typeof req.json !== 'function') return null
  try {
    const body = (await req.json()) as { id?: string | number }
    const id = body?.id
    return typeof id === 'string' || typeof id === 'number' ? id : null
  } catch {
    return null
  }
}

export const adminCampaignEndpoints: Endpoint[] = [
  {
    path: '/campaign-start',
    method: 'post',
    handler: async (req) => {
      if (!isAdmin(req.user)) return forbidden()
      const id = await campaignId(req)
      if (id === null) return badRequest('не передан id кампании')

      try {
        const result = await startCampaign(req.payload, id)
        return Response.json({ ok: true, ...result })
      } catch (error) {
        // CampaignError — предсказуемый отказ бизнес-правила (не черновик,
        // пустой отбор): показываем текст как есть. Всё остальное — сбой,
        // его в лог, наружу без внутренностей.
        if (error instanceof CampaignError) return badRequest(error.message)
        req.payload.logger.error(`Кампания ${id}: старт упал — ${String(error)}`)
        return Response.json({ ok: false, message: 'Не удалось запустить кампанию.' }, { status: 500 })
      }
    },
  },
  {
    path: '/campaign-stop',
    method: 'post',
    handler: async (req) => {
      if (!isAdmin(req.user)) return forbidden()
      const id = await campaignId(req)
      if (id === null) return badRequest('не передан id кампании')

      try {
        const result = await stopCampaign(req.payload, id)
        return Response.json({ ok: true, ...result })
      } catch (error) {
        if (error instanceof CampaignError) return badRequest(error.message)
        req.payload.logger.error(`Кампания ${id}: остановка упала — ${String(error)}`)
        return Response.json({ ok: false, message: 'Не удалось остановить кампанию.' }, { status: 500 })
      }
    },
  },
]
