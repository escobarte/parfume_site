import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CartView } from '@/components/cart/CartView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import type { Locale } from '@/i18n/routing'

export default async function CartPage(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const t = await getTranslations('Cart')

  return (
    <>
      <Breadcrumbs items={[{ label: t('title') }]} />
      <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8 md:py-12">
        <h1 className="text-ink text-section tracking-display border-line border-b pb-5 font-light uppercase">
          {t('title')}
        </h1>
        <div className="mt-8">
          <CartView />
        </div>
      </div>
    </>
  )
}
