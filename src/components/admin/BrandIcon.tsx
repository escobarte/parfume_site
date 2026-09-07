import logoBeige from './logo/mon-flacon-logo-beige-transparent.png'
import logoBlue from './logo/mon-flacon-logo-blue-transparent.png'

/**
 * Знак MON FLACON в шапке /admin (фаза 4.7.6, багфикс — фаза 4.7 приёмка;
 * правка 2026-09-07 — финальные PNG от дизайнера вместо SVG-плейсхолдера,
 * см. docs/logo/). Только `/admin` — фронтовый `BrandMark`
 * (src/components/brand/BrandMark.tsx) сознательно не тронут, замена
 * сайтового знака — отдельное решение, шире рамок этой задачи.
 *
 * Владелец явно попросил полный леттеринг (иконка + «MON FLACON» +
 * тэглайн, `Blue transparent`/`Beige transparent`), не иконку-бейдж —
 * предыдущая версия (2026-09-07в) использовала `icon blue/beige.png`
 * (квадратные плашки), теперь заменены на прозрачные full-lockup файлы.
 * Слот `graphics.Icon`/`.step-nav__home` сам задаёт размер контейнера
 * (custom.scss увеличивает его отдельно), картинка вписывается через
 * `object-fit: contain`, без искажения пропорций. Переключение
 * light/dark — видимостью классов `.brand-icon__light/__dark`, тем же
 * приёмом, что раньше давал `currentColor`.
 */
export function BrandIcon() {
  return (
    <span className="brand-icon" style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- маленький слот с фикс. размером от Payload, next/image тут не даёт выгоды */}
      <img
        src={logoBlue.src}
        alt="Mon Flacon"
        className="brand-icon__light"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoBeige.src}
        alt="Mon Flacon"
        className="brand-icon__dark"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </span>
  )
}
