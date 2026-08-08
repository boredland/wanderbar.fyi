import type { ErrorHandler } from 'hono'
import { translator } from '../lib/i18n'
import { DEFAULT_LOCALE, localePath } from '../lib/i18n/locale'

const handler: ErrorHandler = (e, c) => {
  if ('getResponse' in e) {
    return e.getResponse()
  }
  console.error(e.message)
  const locale = c.get('locale') ?? DEFAULT_LOCALE
  const t = translator(locale)
  c.status(500)
  return c.render(
    <main class="mx-auto flex max-w-2xl flex-col items-start gap-4 p-4">
      <title>{`${t('error.broke.title')} · wanderbar`}</title>
      <h1 class="display text-xl font-bold">{t('error.broke.title')}</h1>
      <p class="text-sm text-muted">{t('error.broke.body')}</p>
      <a class="btn btn-primary" href={localePath(locale)}>
        {t('error.back')}
      </a>
    </main>
  )
}

export default handler
