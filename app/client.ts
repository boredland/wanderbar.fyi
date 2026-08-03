import { createClient } from 'honox/client'

createClient()

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}
