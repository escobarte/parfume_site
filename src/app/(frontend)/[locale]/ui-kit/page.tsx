import { setRequestLocale } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

// Временная QA-страница фазы 1 — проверка брендовых токенов MON FLACON
// (BRAND.md §2/§3/§5) и рендера шрифта Inter на трёх локалях.
// Удалить или заменить стайлгайдом в фазе 6 (интеграция дизайна).

const palette = [
  { name: 'navy', hex: '#16293D', className: 'bg-navy' },
  { name: 'cream', hex: '#E8CFB0', className: 'bg-cream' },
  { name: 'surface', hex: '#FFFFFF', className: 'bg-surface' },
  { name: 'surface-warm', hex: '#F6F0E4', className: 'bg-surface-warm' },
  { name: 'line', hex: '#E3DACA', className: 'bg-line' },
  { name: 'danger', hex: '#B3453C', className: 'bg-danger' },
]

// Проверка сабсетов: latin-ext (румынские диакритики) + cyrillic + latin.
const glyphs = [
  { label: 'latin-ext (RO)', sample: 'Ăă Ââ Îî Șș Țț — Parfumuri pentru toată lumea' },
  { label: 'cyrillic (RU)', sample: 'Ароматы для каждого — Ёё Йй Щщ Ъъ Ыы Ээ Юю Яя' },
  { label: 'latin (EN)', sample: 'Find your signature. A scent for every story.' },
]

const scale = [
  { token: 'text-hero', className: 'text-hero', note: '40px / 300 / .14em' },
  { token: 'text-display', className: 'text-display', note: '22px / 300 / .16em' },
  { token: 'text-section', className: 'text-section', note: '15px / 300 / .14em' },
  { token: 'text-body', className: 'text-body', note: '14.5px / 400' },
  { token: 'text-label', className: 'text-label', note: '12px / 500 / .2em' },
  { token: 'text-micro', className: 'text-micro', note: '10.5px / 500 / .2em' },
]

export default async function UiKitPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  return (
    <div className="bg-surface min-h-screen">
      {/* Navy-рама: шапка (WIREFRAMES.md §Шапка) */}
      <header className="bg-navy border-line-on-dark flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
        <div>
          <div className="text-cream text-label tracking-wordmark font-light uppercase">
            Mon Flacon
          </div>
          <div className="text-ink-on-dark-subtle text-micro tracking-eyebrow mt-1 uppercase">
            Perfumes for everyone
          </div>
        </div>
        <div className="text-ink-on-dark-faint text-label tracking-label uppercase">
          <span className="text-cream decoration-cream underline underline-offset-4">{locale}</span>
          {' · '}ui-kit
        </div>
      </header>

      {/* Hero: типографика заголовка на navy */}
      <section className="bg-navy px-6 py-16 text-center sm:py-20">
        <p className="text-ink-on-dark-subtle text-eyebrow tracking-eyebrow uppercase">
          Perfumes for everyone
        </p>
        <h1 className="text-cream text-hero-mobile tracking-display leading-tight sm:text-hero mt-5 font-light uppercase">
          Find your signature.
        </h1>
        <div className="bg-cream/45 mx-auto mt-6 h-px w-11" />
        <p className="text-ink-on-dark-muted text-body leading-body mx-auto mt-6 max-w-md font-light">
          Современная парфюмерная галерея в Кишинёве. Aromă — alegere personală: explorați,
          încercați, găsiți-o pe a voastră.
        </p>
        <Button
          variant="outline"
          className="border-cream text-cream hover:bg-cream hover:text-navy text-label tracking-display mt-8 bg-transparent uppercase"
        >
          Deschide catalogul
        </Button>
      </section>

      <div className="mx-auto flex max-w-5xl flex-col gap-14 px-6 py-14">
        {/* Палитра */}
        <section>
          <h2 className="text-ink text-section tracking-display font-light uppercase">Палитра</h2>
          <div className="border-line mt-5 grid grid-cols-2 gap-px border sm:grid-cols-3 lg:grid-cols-6">
            {palette.map((color) => (
              <div key={color.name} className="bg-line">
                <div className={`${color.className} h-20`} />
                <div className="bg-surface p-3">
                  <div className="text-ink text-micro tracking-label font-medium uppercase">
                    {color.name}
                  </div>
                  <div className="text-ink-muted text-micro mt-1">{color.hex}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Шрифт: сабсеты и диакритики */}
        <section>
          <h2 className="text-ink text-section tracking-display font-light uppercase">
            Inter — сабсеты
          </h2>
          <div className="border-line mt-5 divide-y divide-line border">
            {glyphs.map((glyph) => (
              <div key={glyph.label} className="p-4">
                <div className="text-ink-muted text-micro tracking-label uppercase">
                  {glyph.label}
                </div>
                <p className="text-ink text-body mt-2">{glyph.sample}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Типографическая шкала */}
        <section>
          <h2 className="text-ink text-section tracking-display font-light uppercase">
            Шкала размеров
          </h2>
          <div className="border-line mt-5 divide-y divide-line border">
            {scale.map((step) => (
              <div
                key={step.token}
                className="flex flex-wrap items-baseline justify-between gap-3 p-4"
              >
                <span className={`${step.className} text-ink font-light`}>Șansă · Аромат · Aa</span>
                <span className="text-ink-muted text-micro tracking-label uppercase">
                  {step.token} — {step.note}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Компоненты shadcn на брендовых токенах */}
        <section>
          <h2 className="text-ink text-section tracking-display font-light uppercase">
            Компоненты
          </h2>
          <div className="mt-5 flex flex-col gap-6">
            <div className="flex flex-wrap gap-3">
              <Button>Добавить в корзину</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Nume și prenume" />
              <Select>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выбрать объём" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 ml</SelectItem>
                  <SelectItem value="10">10 ml</SelectItem>
                  <SelectItem value="30">30 ml</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge>Новинка</Badge>
              <Badge variant="secondary">Хит</Badge>
              <Badge variant="destructive">Нет в наличии</Badge>
              <Badge variant="outline">Акция</Badge>
            </div>

            <Skeleton className="h-20 w-full" />
          </div>
        </section>

        {/* Эталонная карточка товара (WIREFRAMES.md §3) */}
        <section>
          <h2 className="text-ink text-section tracking-display font-light uppercase">
            Карточка товара — эталон
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
            {['Signature Wood', 'Cedar Story', 'Warm Amber', 'Șoapte de Mai'].map((title) => (
              <article
                key={title}
                className="border-line hover:border-navy rounded-sm border transition-colors"
              >
                <div className="bg-surface-warm h-[190px]" />
                <div className="flex flex-col gap-1.5 p-4">
                  <span className="text-ink-muted text-micro tracking-label uppercase">
                    Mon Flacon
                  </span>
                  <h3 className="text-ink text-body font-medium">{title}</h3>
                  <p className="text-ink-muted text-label">древесный · сандал, кедр</p>
                  <div className="mt-1 flex gap-1.5">
                    {['5 ml', '10 ml', '30 ml'].map((volume) => (
                      <span
                        key={volume}
                        className="border-line text-ink-muted text-eyebrow rounded-sm border px-1.5 py-0.5"
                      >
                        {volume}
                      </span>
                    ))}
                  </div>
                  <div className="text-ink text-body mt-1 font-medium">от 240 MDL</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* Navy-рама: футер */}
      <footer className="bg-navy border-line-on-dark border-t px-6 py-10">
        <div className="text-cream text-label tracking-wordmark font-light uppercase">
          Mon Flacon
        </div>
        <p className="text-ink-on-dark-faint text-eyebrow mt-3">Scents that feel like you.</p>
        <div className="border-line-on-dark-soft text-ink-on-dark-faint text-eyebrow tracking-label mt-6 border-t pt-4 uppercase">
          © 2026 Mon Flacon · Perfumes for everyone
        </div>
      </footer>
    </div>
  )
}
