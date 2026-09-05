import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import Image from 'next/image'
import { Gift } from 'lucide-react'
import type { GiftItemView } from '@/lib/giftItems/queries'
import { GiftBuyBlock } from './GiftBuyBlock'

/**
 * Карточка подарочного товара (фаза 11.1, задача 2) — не ссылка на отдельную
 * страницу (детальных страниц у сертификатов/Gift box нет, раздел — это
 * список самодостаточных карточек с выбором номинала внутри), в отличие от
 * `ProductCard.tsx`. Фото-зона — тот же паттерн (тёплый фон, рамка 1px).
 */
export function GiftItemCard({ item, typeLabel }: { item: GiftItemView; typeLabel: string }) {
  return (
    <article className="border-line rounded-sm border">
      <div className="bg-surface-warm relative flex h-[220px] items-center justify-center overflow-hidden">
        {item.image ? (
          <Image
            src={item.image.url}
            alt={item.image.alt}
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
            className="object-contain p-6"
          />
        ) : (
          <Gift className="text-navy size-16" strokeWidth={1.2} />
        )}
      </div>

      <div className="flex flex-col gap-3 p-5">
        <h3 className="text-ink text-body font-medium">{item.title}</h3>
        {item.description ? (
          <div className="text-ink-muted text-body-sm leading-body">
            <RichText data={item.description as SerializedEditorState} />
          </div>
        ) : null}

        <GiftBuyBlock item={item} image={item.image?.url ?? null} typeLabel={typeLabel} />
      </div>
    </article>
  )
}
