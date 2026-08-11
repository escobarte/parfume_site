import { BrandMark } from '@/components/brand/BrandMark'

/**
 * Знак MON FLACON в шапке /admin (фаза 4.7.6, багфикс — фаза 4.7 приёмка).
 *
 * Слот `graphics.Icon` у Payload сам задаёт контейнер (у стандартного
 * `.step-nav__home` это фиксированные 18×18px с `overflow: hidden`) — свой
 * размер здесь навязывать нельзя, старая версия рисовала знак в круге
 * 2rem (32px) и он обрезался чужим контейнером. Правильный паттерн —
 * как у штатной PayloadIcon: `width/height: 100%`, знак сам вписывается
 * в то, что дал слот, без искажения пропорций (viewBox 100×118 не квадрат).
 * Цвет — не хардкод, а тема-зависимая переменная tokens.css
 * (см. класс `.brand-icon` в custom.scss: navy на светлой, cream на тёмной).
 */
export function BrandIcon() {
  return (
    <span className="brand-icon" style={{ display: 'flex', width: '100%', height: '100%' }}>
      <BrandMark strokeWidth={6} style={{ width: '100%', height: '100%' }} />
    </span>
  )
}
