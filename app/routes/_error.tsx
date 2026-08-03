import type { ErrorHandler } from 'hono'

const handler: ErrorHandler = (e, c) => {
  if ('getResponse' in e) {
    return e.getResponse()
  }
  console.error(e.message)
  c.status(500)
  return c.render(
    <main class="mx-auto flex max-w-2xl flex-col items-start gap-4 p-4">
      <title>Something broke · wanderbar</title>
      <h1 class="text-xl font-bold tracking-tight">Something broke</h1>
      <p class="text-sm text-muted">
        That is on us, not on you. Your track and settings are stored on your device and
        are unaffected, so reloading is safe.
      </p>
      <a class="btn btn-primary" href="/">
        Back to your track
      </a>
    </main>
  )
}

export default handler
