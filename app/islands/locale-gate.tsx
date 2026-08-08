import { useEffect } from 'hono/jsx'
import { get, set } from '../lib/store'
import { DEFAULT_LOCALE, localePath, type Locale } from '../lib/i18n/locale'

/**
 * Sends a reader who has chosen a language to that language's URL.
 *
 * The server can only negotiate from `Accept-Language`, which is the device's
 * answer rather than the reader's: someone on a German phone who picked French
 * would land on `/de` every time they opened the bare root. The choice lives in
 * IndexedDB, which no server can read, so the correction has to happen here.
 *
 * It navigates rather than re-rendering in place, because the alternative is a
 * page whose <html lang> and prose disagree — an English document with French
 * islands hydrated over it, which is wrong for a screen reader and wrong for a
 * crawler. Only the unprefixed root redirects: an explicit `/de` is a request
 * for German and is left alone, so a shared link always shows what it says.
 */
export default function LocaleGate(props: { locale: Locale }) {
  useEffect(() => {
    get('locale').then((stored) => {
      if (stored === null) {
        /*
         * First visit: seed from the language actually being shown, which is
         * either the path or the Accept-Language redirect that produced it.
         * Without this the service worker would write German readers an
         * English notification until they opened the switcher they never
         * needed to open.
         */
        set('locale', props.locale)
        return
      }
      // Only the bare root redirects; an explicit /de is a request for German
      // and is left alone, so a shared link always shows what it says.
      if (stored !== DEFAULT_LOCALE && location.pathname === '/') {
        location.replace(localePath(stored))
      }
    })
  }, [props.locale])

  return null
}
