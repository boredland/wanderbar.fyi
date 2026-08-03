import type { NotFoundHandler } from 'hono'

const handler: NotFoundHandler = (c) => {
  c.status(404)
  return c.render(
    <main class="mx-auto flex max-w-2xl flex-col items-start gap-4 p-4">
      <title>Page not found · wanderbar</title>
      <h1 class="display text-xl font-bold">Page not found</h1>
      <p class="text-sm text-muted">
        That address does not exist. wanderbar has a single screen: your track and the
        weather along it.
      </p>
      <a class="btn btn-primary" href="/">
        Back to your track
      </a>
    </main>
  )
}

export default handler
