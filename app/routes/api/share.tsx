import { createRoute } from 'honox/factory'
import ShareReceiver from '../../islands/share-receiver-island'
import { translator } from '../../lib/i18n'

const MAX_BYTES = 5 * 1024 * 1024

export const POST = createRoute(async (c) => {
  const locale = c.get('locale')
  const t = translator(locale)
  const body = await c.req.parseBody()
  const file = body['gpx']
  if (!(file instanceof File)) return c.redirect('/?shareError=nofile', 303)
  if (file.size > MAX_BYTES) return c.redirect('/?shareError=toolarge', 303)

  const title = typeof body['title'] === 'string' ? body['title'] : ''
  const payload = JSON.stringify({
    xml: await file.text(),
    title,
    filename: file.name
  }).replace(/</g, '\\u003c')

  // A 303 cannot carry a multi-megabyte body and the server stores nothing,
  // so the bytes are handed to the client, which ingests them into IndexedDB.
  return c.render(
    <div class="mx-auto max-w-2xl p-4">
      <title>{t('share.adding')}</title>
      <ShareReceiver locale={locale} />
      <script type="application/json" id="shared" dangerouslySetInnerHTML={{ __html: payload }} />
    </div>
  )
})
