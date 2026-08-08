import { createRoute } from 'honox/factory'
import { Page } from '../-page'
import { isLocale } from '../../lib/i18n/locale'

/**
 * `/de` and `/fr`.
 *
 * A dynamic segment rather than two hand-written directories, so adding a
 * fourth language is a catalogue and a LOCALES entry and nothing else. Anything
 * that is not a known locale falls through to the 404 rather than rendering the
 * English page under a wrong-looking address.
 */
export default createRoute((c) => {
  const segment = c.req.param('locale')
  if (!isLocale(segment)) return c.notFound()
  return c.render(
    <Page
      locale={segment}
      shareError={c.req.query('shareError')}
      vapidPublicKey={c.env.VAPID_PUBLIC_KEY}
    />
  )
})
