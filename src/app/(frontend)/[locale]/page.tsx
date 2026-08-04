import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'

export default async function HomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  const t = await getTranslations('HomePage')

  return (
    <div className="home">
      <div className="content">
        <h1>{t('greeting')}</h1>
        <p>{t('tagline')}</p>
        <LocaleSwitcher />
      </div>
    </div>
  )
}
