import { createRoute } from 'honox/factory'
import { Page } from './-page'

/**
 * English lives at the root, unprefixed.
 *
 * It was the only language this app had for its whole life so far, so every
 * link already shared points here; moving it to /en would break all of them.
 * The other languages are prefixed; see [locale]/index.tsx and _middleware.ts,
 * which redirects a first visit here to the reader's own language once.
 */
export default createRoute((c) =>
  c.render(
    <Page
      locale={c.get('locale')}
      shareError={c.req.query('shareError')}
      vapidPublicKey={c.env.VAPID_PUBLIC_KEY}
    />
  )
)
