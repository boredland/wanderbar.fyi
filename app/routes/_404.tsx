import type { NotFoundHandler } from 'hono'
import { translator } from '../lib/i18n'
import { DEFAULT_LOCALE, localePath } from '../lib/i18n/locale'

const handler: NotFoundHandler = (c) => {
  // A 404 can be reached before the middleware sets a locale (an unknown
  // top-level path never matches a route), so this falls back rather than
  // assuming one.
  const locale = c.get('locale') ?? DEFAULT_LOCALE
  const t = translator(locale)
  c.status(404)
  return c.render(
    <main class="mx-auto flex max-w-2xl flex-col items-start gap-4 p-4">
      <title>{`${t('error.notFound.title')} · wanderbar`}</title>
      <h1 class="display text-xl font-bold">{t('error.notFound.title')}</h1>
      <p class="text-sm text-muted">{t('error.notFound.body')}</p>
      <a class="btn btn-primary" href={localePath(locale)}>
        {t('error.back')}
      </a>
    </main>
  )
}

export default handler
