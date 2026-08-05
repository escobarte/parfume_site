'use client'

import { Search } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import type { Suggestion } from '@/lib/search/types'

const DEBOUNCE_MS = 250

/**
 * Строка поиска с автодополнением (PLAN.md §5.5).
 * Запрос уходит не чаще чем раз в 250 мс, ответ старого запроса игнорируется.
 * Esc и клик мимо закрывают подсказки.
 */
export function SearchBox({
  autoFocus = false,
  onClose,
}: {
  autoFocus?: boolean
  onClose?: () => void
}) {
  const t = useTranslations('Search')
  const locale = useLocale()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  const term = query.trim()
  // Открыт ли список — вычисляем, а не храним: длина запроса и «закрыли руками»
  // однозначно задают состояние, отдельный setState в эффекте не нужен.
  const open = term.length >= 2 && !dismissed && (items.length > 0 || !loading)

  useEffect(() => {
    if (term.length < 2) return

    const id = ++requestId.current
    const timer = setTimeout(async () => {
      // setLoading внутри таймера, а не в теле эффекта: синхронный setState
      // в эффекте даёт каскадный рендер (правило react-hooks).
      setLoading(true)
      try {
        const response = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(term)}&locale=${locale}`,
        )
        const data = (await response.json()) as { items: Suggestion[] }
        // Ответ устаревшего запроса не должен перетирать свежий.
        if (id !== requestId.current) return
        setItems(data.items ?? [])
      } catch {
        if (id === requestId.current) setItems([])
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [term, locale])

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setDismissed(true)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (open) setDismissed(true)
      else onClose?.()
    }
    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const term = query.trim()
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`)
  }

  return (
    <div ref={boxRef} className="relative">
      <form onSubmit={submit} className="flex items-center gap-3">
        <Search className="text-ink-on-dark-subtle size-4 shrink-0" strokeWidth={1.6} />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => {
            setQuery(event.target.value)
            setDismissed(false)
          }}
          onFocus={() => setDismissed(false)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className="text-cream placeholder:text-ink-on-dark-faint text-body w-full bg-transparent py-1 outline-none"
        />
      </form>

      {open && (
        <div className="border-line bg-surface absolute top-full right-0 left-0 z-50 mt-3 border">
          {items.length === 0 && !loading && (
            <p className="text-ink-muted text-label px-4 py-4">{t('empty')}</p>
          )}
          {items.map((item) => (
            <Link
              key={`${item.type}-${item.slug}`}
              href={item.href}
              onClick={() => setDismissed(true)}
              className="border-line hover:bg-surface-warm flex items-baseline justify-between gap-4 border-b px-4 py-3 last:border-b-0"
            >
              <span className="text-ink text-body">{item.title}</span>
              <span className="text-ink-muted text-micro tracking-label shrink-0 uppercase">
                {t(`type.${item.type}`)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
