/**
 * Кнопки соцсетей на заглушке — тот же outline-стиль, что CTA «CATALOG» на
 * главной (WIREFRAMES.md §1: рамка cream, uppercase, трекинг, заливка на ховере).
 *
 * Пустая переменная окружения = кнопки нет вовсе, без дырки в вёрстке.
 * Переменные `NEXT_PUBLIC_*` подставляются на СБОРКЕ — чтобы добавить TikTok,
 * недостаточно перезапустить контейнер, нужен полный redeploy.
 */
const NETWORKS = [
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
  { label: 'TikTok', href: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
]

export function MaintenanceSocial() {
  const links = NETWORKS.filter(
    (network): network is { label: string; href: string } => Boolean(network.href?.trim()),
  )

  if (links.length === 0) return null

  return (
    <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
      {links.map((network) => (
        <a
          key={network.label}
          href={network.href}
          target="_blank"
          rel="noopener noreferrer"
          className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display inline-block border px-8 py-3.5 uppercase transition-colors"
        >
          {network.label}
        </a>
      ))}
    </div>
  )
}
