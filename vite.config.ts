import build, { defaultOptions } from '@hono/vite-build/cloudflare-workers'
import adapter from '@hono/vite-dev-server/cloudflare'
import tailwindcss from '@tailwindcss/vite'
import honox from 'honox/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    honox({
      devServer: { adapter },
      client: { input: ['/app/client.ts', '/app/style.css'] }
    }),
    tailwindcss(),
    build({
      // The adapter's own hook defines `merged`, which its default-export
      // template needs, so it has to be kept ahead of ours. The generated
      // entry re-exports only the app default, so the Durable Object class
      // must be re-exported explicitly or wrangler cannot bind it.
      entryContentAfterHooks: [
        ...(defaultOptions.entryContentAfterHooks ?? []),
        () => `export { Waker } from './app/waker'`
      ]
    })
  ]
})
