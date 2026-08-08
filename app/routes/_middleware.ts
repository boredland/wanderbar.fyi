import { createRoute } from 'honox/factory'
import { DEFAULT_LOCALE, isLocale, localeFromHeader } from '../lib/i18n/locale'

/**
 * Decides which language the server renders, from the path alone.
 *
 * The path is authoritative here rather than the stored preference, because
 * this runs before any client code and the URL is what a crawler, a share and
 * a bookmark carry. The reader's stored choice takes over once the islands
 * hydrate; see useLocale.
 *
 * `/` has no prefix and stays English: it was the only language this app had
 * for its whole life so far, and every link already shared points at it. A
 * first visit to `/` with a German `Accept-Language` is redirected to `/de`
 * once, so the language someone gets is also a URL they can share.
 */
export default createRoute(async (c, next) => {
  const [, first] = c.req.path.split('/')

  if (isLocale(first) && first !== DEFAULT_LOCALE) {
    c.set('locale', first)
    await next()
    return
  }

  // Only the bare root negotiates: deeper English paths are explicit requests.
  if (c.req.path === '/') {
    const preferred = localeFromHeader(c.req.header('accept-language'))
    if (preferred !== DEFAULT_LOCALE) {
      /*
       * 302, never 301: the header can change between visits and a permanent
       * redirect would pin one reader's browser to a language they may later
       * switch away from. Vary tells caches this body depends on the header.
       */
      c.header('Vary', 'Accept-Language')
      return c.redirect(`/${preferred}`, 302)
    }
  }

  c.set('locale', DEFAULT_LOCALE)
  await next()
})
