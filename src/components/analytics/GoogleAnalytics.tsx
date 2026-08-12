'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { getConsent, onConsentChange } from '@/lib/analytics/consent'
import { GA_ID, isGaConfigured } from '@/lib/analytics/gtag'

/**
 * `gtag.js` грузится только после явного согласия (PLAN.md §7.5) — до этого
 * компонент не рендерит ни одного `<script>`. Реагирует на смену согласия
 * без перезагрузки страницы (баннер и этот компонент общаются через
 * `onConsentChange`, оба смонтированы в `[locale]/layout.tsx`).
 */
export function GoogleAnalytics() {
  const [granted, setGranted] = useState(false)

  useEffect(() => {
    setGranted(getConsent() === 'granted')
    return onConsentChange((value) => setGranted(value === 'granted'))
  }, [])

  if (!granted || !isGaConfigured()) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true });`}
      </Script>
    </>
  )
}
