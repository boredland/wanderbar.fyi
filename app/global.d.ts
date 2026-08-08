import type {} from 'hono'
import type { Locale } from './lib/i18n/locale'

/**
 * Bindings are generated from wrangler.jsonc by `npm run cf-typegen`
 * (worker-configuration.d.ts). Re-run it after changing bindings or vars.
 */
declare global {
  type Bindings = Env
}

declare module 'hono' {
  interface Env {
    Variables: {
      /** Set by routes/_middleware.ts from the path; see localePath. */
      locale: Locale
    }
    Bindings: Bindings
  }
}
