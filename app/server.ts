import { showRoutes } from 'hono/dev'
import { createApp } from 'honox/server'

export { Waker } from './waker'

const app = createApp()

showRoutes(app)

export default app
