import { useEffect, useState } from 'hono/jsx'
import { useLocale } from '../lib/i18n'
import type { Locale } from '../lib/i18n/locale'
import { ingestGpx } from '../lib/ingest'
import { get } from '../lib/store'
import { DEFAULT_PROFILE } from '../lib/track'

/**
 * The share POST hands the GPX to the client as JSON because the server stores
 * nothing. This island does the ingest, and its presence is also what makes
 * the renderer emit the client bundle on this page.
 */
export default function ShareReceiver(props: { locale: Locale }) {
  const [, t] = useLocale(props.locale)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = document.getElementById('shared')
    if (!el?.textContent) {
      location.replace('/')
      return
    }
    const { xml, title, filename } = JSON.parse(el.textContent) as {
      xml: string
      title?: string
      filename?: string
    }
    ;(async () => {
      const track = await get('track')
      const result = await ingestGpx({
        xml,
        shareTitle: title,
        fallbackName: filename,
        profile: track?.profile ?? DEFAULT_PROFILE
      })
      if (result.ok) location.replace('/')
      else setError(t(result.error))
    })()
  }, [])

  if (!error) return <p>{t('share.adding')}</p>
  return (
    <div class="flex flex-col gap-4">
      <p class="text-warn">{error}</p>
      <a class="underline" href="/">
        {t('share.back')}
      </a>
    </div>
  )
}
