import { createRoute } from 'honox/factory'
import Manage from '../islands/manage'
import PositionButton from '../islands/position-button'
import ScheduleSettings from '../islands/schedule-settings'
import Settings from '../islands/settings'
import TrackView from '../islands/track-view'
import Upload from '../islands/upload'

export default createRoute((c) => {
  const shareError = c.req.query('shareError')
  return c.render(
    <main class="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <title>wanderbar</title>
      <h1 class="text-[20px] font-bold">wanderbar</h1>

      <TrackView />

      <details class="rounded-[12px] border border-[--color-line] p-4">
        <summary class="min-h-[44px] cursor-pointer text-[16px] font-medium">Add a track</summary>
        <div class="pt-4">
          <Upload shareError={shareError} />
        </div>
      </details>

      <details class="rounded-[12px] border border-[--color-line] p-4">
        <summary class="min-h-[44px] cursor-pointer text-[16px] font-medium">This track</summary>
        <div class="flex flex-col gap-4 pt-4">
          <PositionButton />
          <Manage />
        </div>
      </details>

      <details class="rounded-[12px] border border-[--color-line] p-4">
        <summary class="min-h-[44px] cursor-pointer text-[16px] font-medium">
          Warning settings
        </summary>
        <div class="pt-4">
          <Settings />
        </div>
      </details>

      <details class="rounded-[12px] border border-[--color-line] p-4">
        <summary class="min-h-[44px] cursor-pointer text-[16px] font-medium">
          Background checks
        </summary>
        <div class="pt-4">
          <ScheduleSettings vapidPublicKey={c.env.VAPID_PUBLIC_KEY} />
        </div>
      </details>

      <footer class="border-t border-[--color-line] pt-4 text-[12px] text-[--color-muted]">
        <a class="underline" href="https://github.com/boredland/wanderbar.fyi">
          Source on GitHub
        </a>
      </footer>
    </main>
  )
})
