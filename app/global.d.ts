import type {} from 'hono'

declare global {
  type Bindings = {
    WAKER: DurableObjectNamespace
    MET_USER_AGENT: string
    VAPID_SUBJECT: string
    VAPID_PUBLIC_KEY: string
    VAPID_PRIVATE_KEY: string
  }
}

declare module 'hono' {
  interface Env {
    Variables: {}
    Bindings: Bindings
  }
}
