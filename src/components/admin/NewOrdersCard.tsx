import Link from 'next/link'
import { getPayloadClient } from '@/lib/payload'

/**
 * Карточка «Новых заявок: N» на дашборде админки (фаза 4.7.3) — ссылка на
 * список заказов, уже отфильтрованный по status=new (тот же формат where в
 * URL, что использует сам список — see qs bracket-нотация Payload admin).
 */
export async function NewOrdersCard() {
  const payload = await getPayloadClient()
  const { totalDocs } = await payload.count({
    collection: 'orders',
    where: { status: { equals: 'new' } },
  })

  return (
    <div style={{ margin: 'calc(var(--base) * 2) 0' }}>
      <Link
        href="/admin/collections/orders?where[status][equals]=new"
        className="new-orders-card__link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '.6em',
          borderRadius: 'var(--style-radius-m)',
          padding: 'calc(var(--base) / 2) var(--base)',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '0.95rem',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '1.8em',
            height: '1.8em',
            padding: '0 .3em',
            borderRadius: '999px',
            background: 'var(--color-status-new)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '.95rem',
          }}
        >
          {totalDocs}
        </span>
        <span>Новых заявок</span>
      </Link>
    </div>
  )
}
