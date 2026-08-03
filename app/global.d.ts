import type {} from 'hono'

/**
 * Bindings are generated from wrangler.jsonc by `npm run cf-typegen`
 * (worker-configuration.d.ts). Re-run it after changing bindings or vars.
 */
declare global {
  type Bindings = Env
}

declare module 'hono' {
  interface Env {
    Variables: {}
    Bindings: Bindings
  }
}
