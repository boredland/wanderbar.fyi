import { useEffect, useState } from 'hono/jsx'

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` is only trustworthy in one direction: false means there is
 * definitely no connection, true means there might be one. That asymmetry is
 * exactly the right way round here, because this is only ever used to *explain*
 * why data is old, never to claim it is current. Age comes from `fetchedAt` and
 * nothing else.
 *
 * Starts optimistic so the server-rendered markup and the first client render
 * agree; nothing offline-dependent is on screen before then anyway, because
 * every reader of this hook is waiting on IndexedDB.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    addEventListener('online', sync)
    addEventListener('offline', sync)
    return () => {
      removeEventListener('online', sync)
      removeEventListener('offline', sync)
    }
  }, [])

  return online
}
