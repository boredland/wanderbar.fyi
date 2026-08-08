import type { Locale } from '../lib/i18n/locale'

/**
 * The FAQ, per language.
 *
 * Out of the route and into its own module because there are now three of it,
 * and 12 answers x 3 languages is the bulk of the prose in this app. Each entry
 * carries the answer twice on purpose: `a` for a person, `text` for the
 * FAQPage JSON-LD. Keeping the pair adjacent is what stops the machine-readable
 * copy drifting from the one a human wrote, and these answers are where the
 * honest caveats live — they are the sentences most likely to be quoted back by
 * something that never read the rest of the page.
 */
export type FaqEntry = { q: string; a: unknown; text: string }

const A = (props: { children?: unknown; href: string }) => (
  <a class="underline" rel="noopener noreferrer" href={props.href}>
    {props.children}
  </a>
)

/**
 * `text` is the same answer as plain prose, for the FAQPage JSON-LD below.
 * Keeping both here rather than stripping tags at runtime means the version a
 * machine quotes is one a human wrote, and it stays in sync by sitting inline.
 */
export const faqEn: FaqEntry[] = [
  {
    q: 'What if I lose reception while it is syncing?',
    a: (
      <>
        <p>
          The forecast you already have stays on screen. A failed fetch never blanks the
          timeline; the freshness line just adds &ldquo;last attempt failed&rdquo;, and the
          time next to &ldquo;Last fetched&rdquo; is always visible so you can judge for
          yourself how old the numbers are.
        </p>
        <p>
          wanderbar also opens offline. The app itself is cached, so you can close it and
          start it again with no signal and still read your track, your ETAs and the last
          forecast that arrived. Only the map background is missing, because map tiles may
          not be stored in bulk.
        </p>
        <p>
          Nothing offline is ever passed off as current. The cache holds the app, never the
          weather: every forecast is stamped with the moment it was fetched. Past two hours
          the freshness line turns; past six a notice above the forecast says in words how
          old it is; past twelve wanderbar withdraws its verdict altogether and greys the
          timeline, because a forecast that old describes hours that have already gone.
        </p>
      </>
    ),
    text:
      'The forecast you already have stays on screen. A failed fetch never blanks the timeline; the freshness line adds "last attempt failed", and the "Last fetched" time is always visible so you can judge how old the numbers are. wanderbar also opens offline: the app itself is cached, so you can close it and start it again with no signal and still read your track, your ETAs and the last forecast that arrived. Only the map background is missing, because map tiles may not be stored in bulk. Nothing offline is passed off as current. The cache holds the app, never the weather: every forecast is stamped with the moment it was fetched. Past two hours the freshness line turns, past six a notice above the forecast says in words how old it is, and past twelve wanderbar withdraws its verdict altogether and greys the timeline, because a forecast that old describes hours that have already gone.'
  },
  {
    q: 'Is my data safe?',
    a: (
      <>
        <p>
          Your track, your position and every forecast are stored only in this browser, and
          there is no account to create. The server has no database for them: it keeps one
          push subscription and one schedule, which is all it needs to wake your device.
          It cannot compute a warning, and it never sees where you are.
        </p>
        <p>
          Two things do leave your device, both to fetch weather. Waypoint coordinates go
          to <A href="https://open-meteo.com/">Open-Meteo</A> directly, rounded to four
          decimals. The cross-check coordinates pass through this site on their way to{' '}
          <A href="https://api.met.no/">MET Norway</A>, because their terms require an
          identifying User-Agent that a browser cannot set. That proxy stores nothing.
        </p>
        <p>Deleting the track, or the browser&rsquo;s site data, removes all of it.</p>
      </>
    ),
    text:
      'Your track, your position and every forecast are stored only in your browser, and there is no account. The server keeps one push subscription and one schedule, nothing else: it cannot compute a warning and never sees where you are. Two things leave your device, both to fetch weather: waypoint coordinates go to Open-Meteo directly, rounded to four decimals, and the cross-check coordinates pass through this site on the way to MET Norway because their terms require an identifying User-Agent a browser cannot set. That proxy stores nothing. Deleting the track, or the browser site data, removes all of it.'
  },
  {
    q: 'How can it check the weather while it is closed?',
    a: (
      <>
        <p>
          The server sends your device an empty wake-up on the schedule you set. Your own
          device then fetches the forecast, compares it with the last one, and only shows
          a notification if something got worse or cleared.
        </p>
        <p>
          This works best on Android with Chrome, where the system can wake the browser
          even when it is not open. On iPhone and iPad you must add wanderbar to the Home
          Screen first; Safari cannot receive these in a normal tab. On a computer the
          browser has to be running.
        </p>
        <p>
          Web push has no silent mode, so on a check where nothing changed your phone may
          briefly show &ldquo;this site has been updated in the background&rdquo;. That is
          the browser talking, not a weather warning.
        </p>
      </>
    ),
    text:
      'The server sends your device an empty wake-up on the schedule you set. Your device then fetches the forecast, compares it with the last one, and shows a notification only if something worsened or cleared. This works best on Android with Chrome, where the system can wake the browser while it is closed. On iPhone and iPad you must add wanderbar to the Home Screen first, because Safari cannot receive push in a normal tab. On a computer the browser has to be running. Web push has no silent mode, so on a check where nothing changed your phone may briefly show "this site has been updated in the background", which is the browser talking, not a weather warning.'
  },
  {
    q: 'When will it warn me, and when will it stay quiet?',
    a: (
      <p>
        Only when the picture changes. Every check compares the new warnings with the
        previous set and notifies on what got worse or cleared, so a forecast that stays
        bad does not notify you again. You choose which conditions count and at what
        threshold under Warning settings.
      </p>
    ),
    text:
      'Only when the picture changes. Every check compares the new warnings with the previous set and notifies on what worsened or cleared, so a forecast that stays bad does not notify you again. You choose which conditions count, and at what threshold, under Warning settings.'
  },
  {
    q: 'Why does it want a recorded track, not a planned route?',
    a: (
      <p>
        wanderbar has no routing engine, so it cannot join the dots of a route file. It
        needs trackpoints closer than about 200 m apart, which is what a recorded track or
        an exported planned track gives you. A file with a handful of corner points is
        rejected rather than guessed at, because inventing the line between them would
        also invent the weather along it.
      </p>
    ),
    text:
      'wanderbar has no routing engine, so it cannot join the dots of a route file. It needs trackpoints closer than about 200 m apart, which a recorded track or an exported planned track provides. A file with a handful of corner points is rejected rather than guessed at, because inventing the line between them would also invent the weather along it.'
  },
  {
    q: 'How does it know where I will be, and when?',
    a: (
      <>
        <p>
          Your track is sampled into waypoints roughly every 2 km, and each one gets an
          arrival time from published pace standards: DIN 33466 and DAV for hiking, the SAC
          scale for mountain terrain, VAM benchmarks for cycling, and the SAC and DAV
          winter rate for hiking on snow. Those count moving time only, so breaks are a
          separate setting rather than a fudged pace.
        </p>
        <p>
          Times assume you start when you say and keep that pace. Tap &ldquo;Update my
          position&rdquo; and it re-anchors to where you actually are, so the rest of the
          timeline shifts with you.
        </p>
      </>
    ),
    text:
      'Your track is sampled into waypoints roughly every 2 km, and each gets an arrival time from published pace standards: DIN 33466 and DAV for hiking, the SAC scale for mountain terrain, VAM benchmarks for cycling, and the SAC and DAV winter rate for hiking on snow. Those count moving time only, so breaks are a separate setting. Times assume you start when you say and keep that pace; updating your position re-anchors the rest of the timeline to where you actually are.'
  },
  {
    q: 'Where does the weather come from?',
    a: (
      <>
        <p>
          Hourly temperature, precipitation, wind, gusts and weather codes come from{' '}
          <A href="https://open-meteo.com/">Open-Meteo</A>, fetched by your device for each
          waypoint. Open-Meteo blends several national models (ECMWF, GFS, ICON) rather
          than relying on one. Sunrise and sunset come from the same place.
        </p>
        <p>
          A few checkpoints are cross-checked against{' '}
          <A href="https://api.met.no/">MET Norway</A> (Yr). When the two disagree on
          temperature or rain, the timeline says so instead of quietly picking one.
        </p>
        <p>
          Elevation comes from your GPX file, or from Open-Meteo&rsquo;s Copernicus
          elevation model if it has none. The two are never mixed within one track, because
          that would invent ascent at the join.
        </p>
      </>
    ),
    text:
      'Hourly temperature, precipitation, wind, gusts and weather codes come from Open-Meteo, fetched by your device for each waypoint; Open-Meteo blends several national models (ECMWF, GFS, ICON) rather than relying on one. Sunrise and sunset come from the same place. A few checkpoints are cross-checked against MET Norway (Yr), and when the two disagree on temperature or rain the timeline says so instead of quietly picking one. Elevation comes from your GPX file, or from Open-Meteo Copernicus elevation model if it has none; the two are never mixed within one track because that would invent ascent at the join.'
  },
  {
    q: 'Which forecast said so?',
    a: (
      <>
        <p>
          Almost everything comes from Open-Meteo, so the timeline only names a
          source when it is <em>not</em> that: &ldquo;MET&rdquo; when the Norwegian
          model saw a storm Open-Meteo did not, &ldquo;Open-Meteo + MET&rdquo; when
          both did, and &ldquo;computed here&rdquo; for fire danger and wind
          chill, which no provider forecasts.
        </p>
        <p>
          A row with no source next to it is an ordinary Open-Meteo reading. The
          heights under Up and Down say whether they came from your GPX file or
          from an elevation model, because those are not the same claim.
        </p>
      </>
    ),
    text:
      'Almost everything comes from Open-Meteo, so the timeline names a source only when it is not that: "MET" when the Norwegian model saw a storm Open-Meteo did not, "Open-Meteo + MET" when both did, and "computed here" for fire danger and wind chill, which no provider forecasts. A warning with no source beside it is an ordinary Open-Meteo reading. The heights under Up and Down say whether they came from your GPX file or from an elevation model, because those are not the same claim.'
  },
  {
    q: 'How is fire danger worked out?',
    a: (
      <p>
        It is calculated on your device, not fetched: no public service offers a free point
        forecast for it. wanderbar runs the Canadian Fire Weather Index over 60 days of
        Open-Meteo weather history, which is what gives it drought memory rather than
        judging today alone. Treat it as an indication, and always follow the local fire
        ban.
      </p>
    ),
    text:
      'It is calculated on your device rather than fetched, because no public service offers a free point forecast for it. wanderbar runs the Canadian Fire Weather Index over 60 days of Open-Meteo weather history, which gives it drought memory rather than judging today alone. Treat it as an indication and always follow the local fire ban.'
  },
  {
    q: 'Does it handle winter hiking?',
    a: (
      <>
        <p>
          Yes. Pick the Winter hiking pace and you get three warnings the summer
          ones miss: freezing rain, which falls as liquid and glazes on contact
          so it counts as neither rain nor snow; wind chill, worked out on your
          device from the model the US and Canadian weather services publish,
          with the frostbite time named once it is short enough to matter; and
          deep lying snow, which is a hazard on a clear day and which the sky
          tells you nothing about.
        </p>
        <p>
          What it cannot know is whether somebody has already broken the trail,
          and in deep snow that matters more than any other single thing. Alpine
          clubs reckon breaking a fresh track costs roughly a fifth to a third of
          the day on top. wanderbar reports the snow; how long it will take you
          through it is your call.
        </p>
      </>
    ),
    text:
      'Yes. Pick the Winter hiking pace and you get three warnings the summer ones miss: freezing rain, which falls as liquid and glazes on contact so it counts as neither rain nor snow; wind chill, worked out on your device from the model the US and Canadian weather services publish, with the frostbite time named once it is short enough to matter; and deep lying snow, which is a hazard on a clear day and which the sky tells you nothing about. What it cannot know is whether somebody has already broken the trail, and in deep snow that matters more than any other single thing. Alpine clubs reckon breaking a fresh track costs roughly a fifth to a third of the day on top. wanderbar reports the snow; how long it will take you through it is your call.'
  },
  {
    q: 'Does it warn about avalanches?',
    a: (
      <>
        <p>
          It shows the official bulletin where one exists &mdash; SLF in
          Switzerland, avalanche.report for Tyrol and Trentino, Varsom in
          Norway, Avalanche Canada &mdash; and links straight to it. What it
          never does is work one out for itself. Avalanche danger comes from the
          structure of the snowpack, weak layers buried weeks ago, and no
          weather forecast can see them.
        </p>
        <p>
          So when there is no bulletin, wanderbar says exactly that instead of
          staying quiet: no service covers this route, or the season has ended,
          or the bulletin has expired, or it could not be reached. None of those
          mean the slope is safe. An expired bulletin loses its number
          altogether, because yesterday&rsquo;s figure on today&rsquo;s snow is
          the most confident way to be wrong.
        </p>
        <p>
          Even with a live bulletin, the danger level is a pointer to the real
          document, not a substitute for it. wanderbar does not know the angle
          or the aspect of the slope you are about to stand on, which is most of
          what decides whether it slides.
        </p>
      </>
    ),
    text:
      'It shows the official bulletin where one exists (SLF in Switzerland, avalanche.report for Tyrol and Trentino, Varsom in Norway, Avalanche Canada) and links straight to it. It never works one out for itself: avalanche danger comes from the structure of the snowpack and weak layers buried weeks ago, which no weather forecast can see. When there is no bulletin, wanderbar says so explicitly rather than staying quiet: no service covers this route, or the season has ended, or the bulletin has expired, or it could not be reached. None of those mean the slope is safe. An expired bulletin loses its number altogether, because yesterday’s figure on today’s snow is the most confident way to be wrong. Even with a live bulletin the danger level is a pointer to the real document, not a substitute for it: wanderbar does not know the angle or aspect of the slope you are about to stand on, which is most of what decides whether it slides.'
  },
  {
    q: 'What does it cost, and who made it?',
    a: (
      <p>
        Nothing, and there are no accounts, adverts or trackers. It is open source:{' '}
        <A href="https://github.com/boredland/wanderbar.fyi">the code is on GitHub</A>. Map
        tiles are by <A href="https://opentopomap.org">OpenTopoMap</A> from OpenStreetMap
        data, and the weather icons are by{' '}
        <A href="https://github.com/metno/weathericons">MET Norway</A>.
      </p>
    ),
    text:
      'Nothing, and there are no accounts, adverts or trackers. It is open source and the code is on GitHub. Map tiles are by OpenTopoMap from OpenStreetMap data, and the weather icons are by MET Norway.'
  }
]

export const faqDe: FaqEntry[] = [
  {
    q: 'Was passiert, wenn du beim Synchronisieren den Empfang verlierst?',
    a: (
      <>
        <p>
          Die Vorhersage, die du schon hast, bleibt auf dem Bildschirm. Ein fehlgeschlagener
          Abruf leert die Zeitleiste nie; in der Frische-Zeile steht dann nur &ldquo;letzter Versuch fehlgeschlagen&rdquo;, und die Zeit neben &ldquo;Zuletzt abgerufen&rdquo; bleibt immer
          sichtbar, damit du selbst beurteilen kannst, wie alt die Werte sind.
        </p>
        <p>
          wanderbar startet auch offline. Die App selbst ist im Cache, also kannst du sie
          ohne Signal schließen und neu starten und trotzdem deinen Track, deine ETAs und
          die zuletzt geladene Vorhersage lesen. Nur der Kartenhintergrund fehlt, weil
          Kartenkacheln nicht in großen Mengen gespeichert werden dürfen.
        </p>
        <p>
          Nichts aus dem Offline-Modus wird als aktuell ausgegeben. Im Cache liegt die App,
          nie das Wetter: Jede Vorhersage trägt den Zeitpunkt ihres Abrufs. Nach zwei
          Stunden kippt die Frische-Zeile; nach sechs sagt ein Hinweis über der Vorhersage
          in Worten, wie alt sie ist; nach zwölf zieht wanderbar sein Urteil ganz zurück und
          graut die Zeitleiste aus, weil so eine alte Vorhersage Stunden beschreibt, die
          längst vorbei sind.
        </p>
      </>
    ),
    text:
      'Die Vorhersage, die du schon hast, bleibt auf dem Bildschirm. Ein fehlgeschlagener Abruf leert die Zeitleiste nie; in der Frische-Zeile steht dann nur "letzter Versuch fehlgeschlagen", und die Zeit neben "Zuletzt abgerufen" bleibt immer sichtbar, damit du selbst beurteilen kannst, wie alt die Werte sind. wanderbar startet auch offline. Die App selbst ist im Cache, also kannst du sie ohne Signal schließen und neu starten und trotzdem deinen Track, deine ETAs und die zuletzt geladene Vorhersage lesen. Nur der Kartenhintergrund fehlt, weil Kartenkacheln nicht in großen Mengen gespeichert werden dürfen. Nichts aus dem Offline-Modus wird als aktuell ausgegeben. Im Cache liegt die App, nie das Wetter: Jede Vorhersage trägt den Zeitpunkt ihres Abrufs. Nach zwei Stunden kippt die Frische-Zeile; nach sechs sagt ein Hinweis über der Vorhersage in Worten, wie alt sie ist; nach zwölf zieht wanderbar sein Urteil ganz zurück und graut die Zeitleiste aus, weil so eine alte Vorhersage Stunden beschreibt, die längst vorbei sind.'
  },
  {
    q: 'Sind deine Daten sicher?',
    a: (
      <>
        <p>
          Dein Track, deine Position und jede Vorhersage liegen nur in diesem Browser, und
          du musst kein Konto anlegen. Der Server hat dafür keine Datenbank: Er speichert
          genau ein Push-Abo und einen Zeitplan, mehr braucht er nicht, um dein Gerät zu
          wecken. Eine Warnung kann er damit nicht berechnen, und wo du bist, sieht er nie.
        </p>
        <p>
          Zwei Dinge verlassen dein Gerät, beide nur fürs Wetterholen. Wegpunkt-Koordinaten
          gehen direkt zu <A href="https://open-meteo.com/">Open-Meteo</A>, auf vier
          Dezimalstellen gerundet. Die Koordinaten für den Gegencheck laufen über diese
          Seite auf dem Weg zu{' '}
          <A href="https://api.met.no/">MET Norway</A>, weil deren Bedingungen einen
          identifizierenden User-Agent verlangen, den ein Browser nicht setzen kann. Dieser
          Proxy speichert nichts.
        </p>
        <p>Wenn du den Track oder die Website-Daten deines Browser&rsquo;s löschst, ist alles weg.</p>
      </>
    ),
    text:
      'Dein Track, deine Position und jede Vorhersage liegen nur in diesem Browser, und du musst kein Konto anlegen. Der Server speichert genau ein Push-Abo und einen Zeitplan, mehr nicht: Eine Warnung kann er damit nicht berechnen, und wo du bist, sieht er nie. Zwei Dinge verlassen dein Gerät, beide nur fürs Wetterholen: Wegpunkt-Koordinaten gehen direkt zu Open-Meteo, auf vier Dezimalstellen gerundet, und die Koordinaten für den Gegencheck laufen über diese Seite auf dem Weg zu MET Norway, weil deren Bedingungen einen identifizierenden User-Agent verlangen, den ein Browser nicht setzen kann. Dieser Proxy speichert nichts. Wenn du den Track oder die Website-Daten des Browsers löschst, ist alles weg.'
  },
  {
    q: 'Wie kann es das Wetter prüfen, wenn es geschlossen ist?',
    a: (
      <>
        <p>
          Der Server schickt deinem Gerät zum von dir gesetzten Zeitplan einen leeren
          Weckruf. Dein eigenes Gerät holt dann die Vorhersage, vergleicht sie mit der
          letzten und zeigt nur eine Benachrichtigung, wenn etwas schlechter wurde oder sich
          entspannt hat.
        </p>
        <p>
          Das klappt am besten auf Android mit Chrome, weil das System den Browser auch
          wecken kann, wenn er nicht offen ist. Auf iPhone und iPad musst du wanderbar
          zuerst zum Home Screen hinzufügen; Safari empfängt so etwas nicht in einem
          normalen Tab. Am Computer muss der Browser laufen.
        </p>
        <p>
          Web Push kennt keinen stillen Modus, daher kann dein Handy bei einem Check ohne
          Änderung kurz &ldquo;this site has been updated in the background&rdquo; anzeigen.
          Das ist der Browser, keine Wetterwarnung.
        </p>
      </>
    ),
    text:
      'Der Server schickt deinem Gerät zum von dir gesetzten Zeitplan einen leeren Weckruf. Dein eigenes Gerät holt dann die Vorhersage, vergleicht sie mit der letzten und zeigt nur eine Benachrichtigung, wenn etwas schlechter wurde oder sich entspannt hat. Das klappt am besten auf Android mit Chrome, weil das System den Browser auch wecken kann, wenn er nicht offen ist. Auf iPhone und iPad musst du wanderbar zuerst zum Home Screen hinzufügen, weil Safari so etwas nicht in einem normalen Tab empfängt. Am Computer muss der Browser laufen. Web Push kennt keinen stillen Modus, daher kann dein Handy bei einem Check ohne Änderung kurz "this site has been updated in the background" anzeigen; das ist der Browser, keine Wetterwarnung.'
  },
  {
    q: 'Wann warnt es dich, und wann bleibt es still?',
    a: (
      <p>
        Nur wenn sich das Bild ändert. Bei jedem Check werden die neuen Warnungen mit dem
        vorherigen Satz verglichen und nur das gemeldet, was schlimmer wurde oder sich
        entspannt hat, sodass eine Vorhersage, die schlecht bleibt, dich nicht erneut
        benachrichtigt. Unter Warn-Einstellungen legst du fest, welche Bedingungen zählen
        und ab welchem Schwellenwert.
      </p>
    ),
    text:
      'Nur wenn sich das Bild ändert. Bei jedem Check werden die neuen Warnungen mit dem vorherigen Satz verglichen und nur das gemeldet, was schlimmer wurde oder sich entspannt hat, sodass eine Vorhersage, die schlecht bleibt, dich nicht erneut benachrichtigt. Unter Warn-Einstellungen legst du fest, welche Bedingungen zählen und ab welchem Schwellenwert.'
  },
  {
    q: 'Warum will es einen aufgezeichneten Track und keine geplante Route?',
    a: (
      <p>
        wanderbar hat keine Routing-Engine, also kann es die Punkte einer Routendatei nicht
        verbinden. Es braucht Trackpunkte mit weniger als etwa 200 m Abstand; die liefert
        ein aufgezeichneter Track oder ein exportierter geplanter Track. Eine Datei mit nur
        ein paar Eckpunkten wird abgewiesen statt erraten, denn eine erfundene Linie
        dazwischen würde auch das Wetter entlang dieser Linie erfinden.
      </p>
    ),
    text:
      'wanderbar hat keine Routing-Engine, also kann es die Punkte einer Routendatei nicht verbinden. Es braucht Trackpunkte mit weniger als etwa 200 m Abstand; die liefert ein aufgezeichneter Track oder ein exportierter geplanter Track. Eine Datei mit nur ein paar Eckpunkten wird abgewiesen statt erraten, denn eine erfundene Linie dazwischen würde auch das Wetter entlang dieser Linie erfinden.'
  },
  {
    q: 'Woher weiß es, wo du sein wirst, und wann?',
    a: (
      <>
        <p>
          Dein Track wird ungefähr alle 2 km in Wegpunkte gesampelt, und jeder bekommt eine
          Ankunftszeit aus veröffentlichten Gehzeitformeln: DIN 33466 und DAV fürs Wandern,
          die SAC-Skala für alpines Gelände, VAM-Benchmarks fürs Radfahren und den SAC- und
          DAV-Wintersatz fürs Gehen auf Schnee. Diese Sätze zählen nur die Bewegungszeit,
          daher sind Pausen eine eigene Einstellung statt einer geschönten Pace.
        </p>
        <p>
          Die Zeiten gehen davon aus, dass du dann startest, wenn du es angibst, und dieses
          Tempo hältst. Tipp auf &ldquo;Meine Position aktualisieren&rdquo; und es verankert neu auf
          deine tatsächliche Position, sodass sich der Rest der Zeitleiste mit dir
          verschiebt.
        </p>
      </>
    ),
    text:
      'Dein Track wird ungefähr alle 2 km in Wegpunkte gesampelt, und jeder bekommt eine Ankunftszeit aus veröffentlichten Gehzeitformeln: DIN 33466 und DAV fürs Wandern, die SAC-Skala für alpines Gelände, VAM-Benchmarks fürs Radfahren und den SAC- und DAV-Wintersatz fürs Gehen auf Schnee. Diese Sätze zählen nur die Bewegungszeit, daher sind Pausen eine eigene Einstellung statt einer geschönten Pace. Die Zeiten gehen davon aus, dass du dann startest, wenn du es angibst, und dieses Tempo hältst; mit "Meine Position aktualisieren" verankert es neu auf deine tatsächliche Position, sodass sich der Rest der Zeitleiste mit dir verschiebt.'
  },
  {
    q: 'Woher kommt das Wetter?',
    a: (
      <>
        <p>
          Stündliche Temperatur, Niederschlag, Wind, Böen und Wettercodes kommen von{' '}
          <A href="https://open-meteo.com/">Open-Meteo</A>, von deinem Gerät für jeden
          Wegpunkt abgefragt. Open-Meteo mischt mehrere nationale Modelle (ECMWF, GFS,
          ICON), statt sich auf eins zu verlassen. Sonnenaufgang und Sonnenuntergang kommen
          von derselben Quelle.
        </p>
        <p>
          Ein paar Kontrollpunkte werden gegen{' '}
          <A href="https://api.met.no/">MET Norway</A> (Yr) gegengeprüft. Wenn sich beide
          bei Temperatur oder Regen widersprechen, sagt die Zeitleiste das offen, statt
          still eins auszuwählen.
        </p>
        <p>
          Die Höhe kommt aus deiner GPX-Datei oder aus Open-Meteo&rsquo;s Copernicus-
          Höhenmodell, falls sie keine Höhenwerte hat. Beides wird innerhalb eines Tracks
          nie gemischt, weil das am Übergang erfundene Höhenmeter im Aufstieg erzeugen
          würde.
        </p>
      </>
    ),
    text:
      'Stündliche Temperatur, Niederschlag, Wind, Böen und Wettercodes kommen von Open-Meteo, von deinem Gerät für jeden Wegpunkt abgefragt; Open-Meteo mischt mehrere nationale Modelle (ECMWF, GFS, ICON), statt sich auf eins zu verlassen. Sonnenaufgang und Sonnenuntergang kommen von derselben Quelle. Ein paar Kontrollpunkte werden gegen MET Norway (Yr) gegengeprüft, und wenn sich beide bei Temperatur oder Regen widersprechen, sagt die Zeitleiste das offen, statt still eins auszuwählen. Die Höhe kommt aus deiner GPX-Datei oder aus Open-Meteos Copernicus-Höhenmodell, falls sie keine Höhenwerte hat; beides wird innerhalb eines Tracks nie gemischt, weil das am Übergang erfundene Höhenmeter im Aufstieg erzeugen würde.'
  },
  {
    q: 'Welche Vorhersage hat das gesagt?',
    a: (
      <>
        <p>
          Fast alles kommt von Open-Meteo, darum nennt die Zeitleiste eine Quelle nur dann,
          wenn es <em>nicht</em> diese ist: &ldquo;MET&rdquo;, wenn das norwegische Modell
          ein Gewitter sah, das Open-Meteo nicht sah, &ldquo;Open-Meteo + MET&rdquo;, wenn
          beide es sahen, und &ldquo;computed here&rdquo; für Waldbrandgefahr und
          Windchill, die kein Anbieter vorhersagt.
        </p>
        <p>
          Eine Zeile ohne Quellenhinweis daneben ist ein normaler Open-Meteo-Wert. Die
          Höhen unter Aufstieg und Abstieg sagen, ob sie aus deiner GPX-Datei oder aus einem
          Höhenmodell kommen, denn das ist nicht dieselbe Aussage.
        </p>
      </>
    ),
    text:
      'Fast alles kommt von Open-Meteo, darum nennt die Zeitleiste eine Quelle nur dann, wenn es nicht diese ist: "MET", wenn das norwegische Modell ein Gewitter sah, das Open-Meteo nicht sah, "Open-Meteo + MET", wenn beide es sahen, und "computed here" für Waldbrandgefahr und Windchill, die kein Anbieter vorhersagt. Eine Zeile ohne Quellenhinweis daneben ist ein normaler Open-Meteo-Wert. Die Höhen unter Aufstieg und Abstieg sagen, ob sie aus deiner GPX-Datei oder aus einem Höhenmodell kommen, denn das ist nicht dieselbe Aussage.'
  },
  {
    q: 'Wie wird die Waldbrandgefahr berechnet?',
    a: (
      <p>
        Sie wird auf deinem Gerät berechnet, nicht abgefragt: Kein öffentlicher Dienst
        bietet dafür eine kostenlose Punktvorhersage. wanderbar rechnet den Canadian Fire
        Weather Index über 60 Tage Open-Meteo-Wetterhistorie, und genau das gibt ihm
        Dürre-Gedächtnis statt nur den heutigen Tag zu bewerten. Sieh es als Hinweis und
        halte dich immer an das lokale Feuerverbot.
      </p>
    ),
    text:
      'Sie wird auf deinem Gerät berechnet, nicht abgefragt, weil kein öffentlicher Dienst dafür eine kostenlose Punktvorhersage bietet. wanderbar rechnet den Canadian Fire Weather Index über 60 Tage Open-Meteo-Wetterhistorie, und genau das gibt ihm Dürre-Gedächtnis statt nur den heutigen Tag zu bewerten. Sieh es als Hinweis und halte dich immer an das lokale Feuerverbot.'
  },
  {
    q: 'Kann es Winterwandern abdecken?',
    a: (
      <>
        <p>
          Ja. Wählst du die Pace Winterwandern, bekommst du drei Warnungen, die die
          Sommermodi verpassen: gefrierender Regen, der flüssig fällt und beim Kontakt
          sofort vereist und daher weder als Regen noch als Schnee zählt; Windchill, auf
          deinem Gerät aus dem Modell berechnet, das die US- und kanadischen Wetterdienste
          veröffentlichen, mit benannter Erfrierungszeit, sobald sie kurz genug ist, um
          wirklich zu zählen; und tiefe Schneelage beziehungsweise Trittschnee, der auch an
          einem klaren Tag gefährlich ist und über den dir der Himmel nichts verrät.
        </p>
        <p>
          Was es nicht wissen kann: ob schon jemand die Spur gebrochen hat, und bei tiefem
          Schnee zählt das mehr als fast alles andere. Alpenvereine rechnen dafür grob ein
          Fünftel bis ein Drittel vom Tag obendrauf. wanderbar meldet den Schnee; wie lange
          du durchkommst, ist dein Entscheid.
        </p>
      </>
    ),
    text:
      'Ja. Wählst du die Pace Winterwandern, bekommst du drei Warnungen, die die Sommermodi verpassen: gefrierender Regen, der flüssig fällt und beim Kontakt sofort vereist und daher weder als Regen noch als Schnee zählt; Windchill, auf deinem Gerät aus dem Modell berechnet, das die US- und kanadischen Wetterdienste veröffentlichen, mit benannter Erfrierungszeit, sobald sie kurz genug ist, um wirklich zu zählen; und tiefe Schneelage beziehungsweise Trittschnee, der auch an einem klaren Tag gefährlich ist und über den dir der Himmel nichts verrät. Was es nicht wissen kann: ob schon jemand die Spur gebrochen hat, und bei tiefem Schnee zählt das mehr als fast alles andere. Alpenvereine rechnen dafür grob ein Fünftel bis ein Drittel vom Tag obendrauf. wanderbar meldet den Schnee; wie lange du durchkommst, ist dein Entscheid.'
  },
  {
    q: 'Warnt es vor Lawinen?',
    a: (
      <>
        <p>
          Es zeigt den offiziellen Lawinenlagebericht dort, wo es einen gibt &mdash; SLF in
          der Schweiz, avalanche.report für Tirol und Trentino, Varsom in Norwegen,
          Avalanche Canada &mdash; und verlinkt direkt dorthin. Was es nie tut: selbst
          einen zu berechnen. Lawinengefahr kommt aus dem Aufbau der Schneedecke und aus
          Schwachschichten, die seit Wochen vergraben sein können, und keine
          Wettervorhersage sieht das.
        </p>
        <p>
          Wenn es keinen Bericht gibt, sagt wanderbar genau das, statt still zu bleiben:
          Kein Dienst deckt diese Route ab, oder die Saison ist vorbei, oder der Bericht ist
          abgelaufen, oder er war nicht erreichbar. Nichts davon heißt, dass der Hang
          sicher ist. Ein abgelaufener Bericht verliert seine Zahl komplett, weil ein gestern&rsquo;s Urteil auf heut&rsquo;igem Schnee die sicherste Art ist, selbstbewusst
          falsch zu liegen.
        </p>
        <p>
          Selbst mit einem aktuellen Bericht ist die Gefahrenstufe ein Zeiger aufs echte
          Dokument, kein Ersatz dafür. wanderbar kennt weder die Neigung noch die Exposition
          des Hangs, auf dem du gleich stehst, und das entscheidet meistens, ob er rutscht.
        </p>
      </>
    ),
    text:
      'Es zeigt den offiziellen Lawinenlagebericht dort, wo es einen gibt (SLF in der Schweiz, avalanche.report für Tirol und Trentino, Varsom in Norwegen, Avalanche Canada), und verlinkt direkt dorthin. Was es nie tut: selbst einen zu berechnen; Lawinengefahr kommt aus dem Aufbau der Schneedecke und aus Schwachschichten, die seit Wochen vergraben sein können, und keine Wettervorhersage sieht das. Wenn es keinen Bericht gibt, sagt wanderbar genau das, statt still zu bleiben: Kein Dienst deckt diese Route ab, oder die Saison ist vorbei, oder der Bericht ist abgelaufen, oder er war nicht erreichbar. Nichts davon heißt, dass der Hang sicher ist. Ein abgelaufener Bericht verliert seine Zahl komplett, weil ein Urteil von gestern auf heutigem Schnee die sicherste Art ist, selbstbewusst falsch zu liegen. Selbst mit einem aktuellen Bericht ist die Gefahrenstufe ein Zeiger aufs echte Dokument, kein Ersatz dafür. wanderbar kennt weder die Neigung noch die Exposition des Hangs, auf dem du gleich stehst, und das entscheidet meistens, ob er rutscht.'
  },
  {
    q: 'Was kostet es, und wer hat es gemacht?',
    a: (
      <p>
        Nichts, und es gibt keine Konten, keine Werbung und keine Tracker. Es ist Open
        Source:{' '}
        <A href="https://github.com/boredland/wanderbar.fyi">der Code liegt auf GitHub</A>.
        Kartenkacheln sind von <A href="https://opentopomap.org">OpenTopoMap</A> auf Basis
        von OpenStreetMap-Daten, und die Wettersymbole kommen von{' '}
        <A href="https://github.com/metno/weathericons">MET Norway</A>.
      </p>
    ),
    text:
      'Nichts, und es gibt keine Konten, keine Werbung und keine Tracker. Es ist Open Source und der Code liegt auf GitHub. Kartenkacheln sind von OpenTopoMap auf Basis von OpenStreetMap-Daten, und die Wettersymbole kommen von MET Norway.'
  }
]

export const faqFr: FaqEntry[] = [
  {
    q: "Et si tu perds le réseau pendant la synchronisation ?",
    a: (
      <>
        <p>
          La prévision que tu as déjà reste à l&rsquo;écran. Un échec de récupération ne vide
          jamais la frise&nbsp;: la ligne de fraîcheur ajoute juste &ldquo;dernière tentative
          échouée&rdquo;, et l&rsquo;heure à côté de &ldquo;Dernière récupération&rdquo; reste toujours
          visible pour que tu juges toi-même de l&rsquo;âge des chiffres.
        </p>
        <p>
          wanderbar s&rsquo;ouvre aussi hors ligne. L&rsquo;app elle-même est en cache, donc tu
          peux la fermer puis la relancer sans signal et lire quand même ton tracé, tes ETA
          et la dernière prévision reçue. Seul le fond de carte manque, parce que les tuiles
          ne peuvent pas être stockées en masse.
        </p>
        <p>
          Rien hors ligne n&rsquo;est jamais vendu comme actuel. Le cache garde l&rsquo;app, jamais
          la météo&nbsp;: chaque prévision porte l&rsquo;heure exacte de récupération. Au-delà de
          deux heures, la ligne de fraîcheur change&nbsp;; au-delà de six, un avis au-dessus de
          la prévision dit en clair de combien de temps elle date&nbsp;; au-delà de douze,
          wanderbar retire carrément son verdict et grise la frise, parce qu&rsquo;une prévision
          aussi vieille décrit des heures déjà passées.
        </p>
      </>
    ),
    text:
      "La prévision que tu as déjà reste à l'écran. Un échec de récupération ne vide jamais la frise : la ligne de fraîcheur ajoute juste \"dernière tentative échouée\", et l'heure à côté de \"Dernière récupération\" reste toujours visible pour que tu juges toi-même de l'âge des chiffres. wanderbar s'ouvre aussi hors ligne : l'app elle-même est en cache, donc tu peux la fermer puis la relancer sans signal et lire quand même ton tracé, tes ETA et la dernière prévision reçue. Seul le fond de carte manque, parce que les tuiles ne peuvent pas être stockées en masse. Rien hors ligne n'est jamais vendu comme actuel. Le cache garde l'app, jamais la météo : chaque prévision porte l'heure exacte de récupération. Au-delà de deux heures, la ligne de fraîcheur change ; au-delà de six, un avis au-dessus de la prévision dit en clair de combien de temps elle date ; au-delà de douze, wanderbar retire carrément son verdict et grise la frise, parce qu'une prévision aussi vieille décrit des heures déjà passées."
  },
  {
    q: "Mes données sont-elles en sécurité ?",
    a: (
      <>
        <p>
          Ton tracé, ta position et chaque prévision sont stockés uniquement dans ce
          navigateur, et tu n&rsquo;as aucun compte à créer. Le serveur n&rsquo;a pas de base de
          données pour ça&nbsp;: il garde un abonnement push et une planification, c&rsquo;est tout
          ce qu&rsquo;il lui faut pour réveiller ton appareil. Il ne peut pas calculer une alerte,
          et il ne voit jamais où tu es.
        </p>
        <p>
          Deux choses quittent ton appareil, uniquement pour récupérer la météo. Les
          coordonnées des points passent directement à{' '}
          <A href="https://open-meteo.com/">Open-Meteo</A>, arrondies à quatre décimales.
          Les coordonnées de contre-vérification passent par ce site avant d&rsquo;aller vers{' '}
          <A href="https://api.met.no/">MET Norway</A>, parce que leurs conditions imposent
          un User-Agent identifiant qu&rsquo;un navigateur ne peut pas définir. Ce proxy ne
          stocke rien.
        </p>
        <p>Supprimer le tracé, ou les données du site du navigateur, supprime tout.</p>
      </>
    ),
    text:
      "Ton tracé, ta position et chaque prévision sont stockés uniquement dans ton navigateur, et tu n'as aucun compte. Le serveur garde un abonnement push et une planification, rien d'autre : il ne peut pas calculer une alerte et il ne voit jamais où tu es. Deux choses quittent ton appareil, uniquement pour récupérer la météo : les coordonnées des points vont directement à Open-Meteo, arrondies à quatre décimales, et les coordonnées de contre-vérification passent par ce site vers MET Norway parce que leurs conditions imposent un User-Agent identifiant qu'un navigateur ne peut pas définir. Ce proxy ne stocke rien. Supprimer le tracé, ou les données du site du navigateur, supprime tout."
  },
  {
    q: "Comment ça vérifie la météo quand c'est fermé ?",
    a: (
      <>
        <p>
          Le serveur envoie à ton appareil un réveil vide selon la planification que tu as
          choisie. Ton propre appareil récupère ensuite la prévision, la compare à la
          précédente, et n&rsquo;affiche une notification que si quelque chose s&rsquo;est aggravé ou
          s&rsquo;est amélioré.
        </p>
        <p>
          Ça marche le mieux sur Android avec Chrome, où le système peut réveiller le
          navigateur même quand il n&rsquo;est pas ouvert. Sur iPhone et iPad, tu dois d&rsquo;abord
          ajouter wanderbar à l&rsquo;écran d&rsquo;accueil&nbsp;; Safari ne reçoit pas ces notifications
          dans un onglet normal. Sur ordinateur, le navigateur doit tourner.
        </p>
        <p>
          Le push web n&rsquo;a pas de mode silencieux, donc sur un contrôle où rien n&rsquo;a changé,
          ton téléphone peut brièvement afficher &ldquo;ce site a été mis à jour en
          arrière-plan&rdquo;. C&rsquo;est le navigateur qui parle, pas une alerte météo.
        </p>
      </>
    ),
    text:
      "Le serveur envoie à ton appareil un réveil vide selon la planification que tu as choisie. Ton appareil récupère ensuite la prévision, la compare à la précédente et n'affiche une notification que si quelque chose s'est aggravé ou s'est amélioré. Ça marche le mieux sur Android avec Chrome, où le système peut réveiller le navigateur même quand il est fermé. Sur iPhone et iPad, tu dois d'abord ajouter wanderbar à l'écran d'accueil, parce que Safari ne reçoit pas les push dans un onglet normal. Sur ordinateur, le navigateur doit tourner. Le push web n'a pas de mode silencieux, donc sur un contrôle où rien n'a changé, ton téléphone peut brièvement afficher \"ce site a été mis à jour en arrière-plan\" : c'est le navigateur qui parle, pas une alerte météo."
  },
  {
    q: "Quand est-ce que ça m'alerte, et quand est-ce que ça se tait ?",
    a: (
      <p>
        Seulement quand la situation change. Chaque contrôle compare les nouvelles alertes
        au lot précédent et notifie ce qui s&rsquo;est aggravé ou amélioré, donc une prévision qui
        reste mauvaise ne te renvoie pas d&rsquo;alerte. Tu choisis quelles conditions comptent
        et à partir de quel seuil dans les Réglages d&rsquo;alerte.
      </p>
    ),
    text:
      "Seulement quand la situation change. Chaque contrôle compare les nouvelles alertes au lot précédent et notifie ce qui s'est aggravé ou amélioré, donc une prévision qui reste mauvaise ne te renvoie pas d'alerte. Tu choisis quelles conditions comptent et à partir de quel seuil dans les Réglages d'alerte."
  },
  {
    q: "Pourquoi il veut un tracé enregistré, et pas un itinéraire planifié ?",
    a: (
      <p>
        wanderbar n&rsquo;a pas de moteur d&rsquo;itinéraire, donc il ne peut pas relier les points d&rsquo;un
        fichier de route. Il lui faut des points de tracé espacés de moins d&rsquo;environ 200 m,
        ce qu&rsquo;un tracé enregistré ou un tracé planifié exporté te donne. Un fichier avec
        juste quelques points d&rsquo;angle est rejeté plutôt que deviné, parce qu&rsquo;inventer la
        ligne entre eux inventerait aussi la météo le long de cette ligne.
      </p>
    ),
    text:
      "wanderbar n'a pas de moteur d'itinéraire, donc il ne peut pas relier les points d'un fichier de route. Il lui faut des points de tracé espacés de moins d'environ 200 m, ce qu'un tracé enregistré ou un tracé planifié exporté te donne. Un fichier avec juste quelques points d'angle est rejeté plutôt que deviné, parce qu'inventer la ligne entre eux inventerait aussi la météo le long de cette ligne."
  },
  {
    q: "Comment il sait où tu seras, et quand ?",
    a: (
      <>
        <p>
          Ton tracé est échantillonné en points de passage environ tous les 2 km, et chacun
          reçoit une heure d&rsquo;arrivée à partir de barèmes d&rsquo;allure publiés&nbsp;: DIN 33466 et
          DAV pour la rando, l&rsquo;échelle SAC pour le terrain de montagne, des repères VAM pour
          le vélo, et le rythme hivernal SAC et DAV pour la rando sur neige. Ces barèmes ne
          comptent que le temps en mouvement, donc les pauses sont un réglage séparé, pas
          une allure bidouillée.
        </p>
        <p>
          Les heures supposent que tu pars quand tu le dis et que tu gardes cette allure.
          Appuie sur &ldquo;Mettre à jour ma position&rdquo; et ça se recale sur là où tu es vraiment,
          donc le reste de la frise se décale avec toi.
        </p>
      </>
    ),
    text:
      "Ton tracé est échantillonné en points de passage environ tous les 2 km, et chacun reçoit une heure d'arrivée à partir de barèmes d'allure publiés : DIN 33466 et DAV pour la rando, l'échelle SAC pour le terrain de montagne, des repères VAM pour le vélo, et le rythme hivernal SAC et DAV pour la rando sur neige. Ces barèmes ne comptent que le temps en mouvement, donc les pauses sont un réglage séparé, pas une allure bidouillée. Les heures supposent que tu pars quand tu le dis et que tu gardes cette allure ; mettre à jour ta position recale le reste de la frise sur là où tu es vraiment."
  },
  {
    q: "D'où vient la météo ?",
    a: (
      <>
        <p>
          La température horaire, les précipitations, le vent, les rafales et les codes météo
          viennent de{' '}
          <A href="https://open-meteo.com/">Open-Meteo</A>, récupérés par ton appareil pour
          chaque point de passage. Open-Meteo combine plusieurs modèles nationaux (ECMWF,
          GFS, ICON) au lieu d&rsquo;en suivre un seul. Aube et crépuscule viennent du même
          endroit.
        </p>
        <p>
          Quelques points de contrôle sont contre-vérifiés avec{' '}
          <A href="https://api.met.no/">MET Norway</A> (Yr). Quand les deux ne sont pas
          d&rsquo;accord sur la température ou la pluie, la frise l&rsquo;indique au lieu d&rsquo;en choisir
          un en silence.
        </p>
        <p>
          L&rsquo;altitude vient de ton fichier GPX, ou du modèle d&rsquo;élévation Copernicus
          d&rsquo;Open-Meteo s&rsquo;il n&rsquo;y en a pas. Les deux ne sont jamais mélangés dans un même
          tracé, parce que ça inventerait du dénivelé positif au raccord.
        </p>
      </>
    ),
    text:
      "La température horaire, les précipitations, le vent, les rafales et les codes météo viennent d'Open-Meteo, récupérés par ton appareil pour chaque point de passage ; Open-Meteo combine plusieurs modèles nationaux (ECMWF, GFS, ICON) au lieu d'en suivre un seul. Aube et crépuscule viennent du même endroit. Quelques points de contrôle sont contre-vérifiés avec MET Norway (Yr), et quand les deux ne sont pas d'accord sur la température ou la pluie la frise l'indique au lieu d'en choisir un en silence. L'altitude vient de ton fichier GPX, ou du modèle d'élévation Copernicus d'Open-Meteo s'il n'y en a pas ; les deux ne sont jamais mélangés dans un même tracé parce que ça inventerait du dénivelé positif au raccord."
  },
  {
    q: "Quelle prévision a dit ça ?",
    a: (
      <>
        <p>
          Presque tout vient d&rsquo;Open-Meteo, donc la frise ne nomme une source que quand ce
          n&rsquo;est <em>pas</em> ça&nbsp;: &ldquo;MET&rdquo; quand le modèle norvégien a vu un orage
          qu&rsquo;Open-Meteo n&rsquo;a pas vu, &ldquo;Open-Meteo + MET&rdquo; quand les deux l&rsquo;ont vu,
          et &ldquo;calculé ici&rdquo; pour le risque d&rsquo;incendie et le refroidissement
          éolien, que personne ne prévoit directement.
        </p>
        <p>
          Une ligne sans source à côté est une lecture Open-Meteo normale. Les valeurs sous
          Dénivelé positif et Dénivelé négatif disent si elles viennent de ton fichier GPX
          ou d&rsquo;un modèle d&rsquo;élévation, parce que ce n&rsquo;est pas la même affirmation.
        </p>
      </>
    ),
    text:
      "Presque tout vient d'Open-Meteo, donc la frise ne nomme une source que quand ce n'est pas ça : \"MET\" quand le modèle norvégien a vu un orage qu'Open-Meteo n'a pas vu, \"Open-Meteo + MET\" quand les deux l'ont vu, et \"calculé ici\" pour le risque d'incendie et le refroidissement éolien, que personne ne prévoit directement. Une ligne sans source à côté est une lecture Open-Meteo normale. Les valeurs sous Dénivelé positif et Dénivelé négatif disent si elles viennent de ton fichier GPX ou d'un modèle d'élévation, parce que ce n'est pas la même affirmation."
  },
  {
    q: "Comment le risque d'incendie est calculé ?",
    a: (
      <p>
        C&rsquo;est calculé sur ton appareil, pas récupéré&nbsp;: aucun service public ne propose
        de prévision ponctuelle gratuite pour ça. wanderbar fait tourner l&rsquo;indice
        forêt-météo (FWI) canadien sur 60 jours d&rsquo;historique météo Open-Meteo, ce qui lui
        donne une mémoire de sécheresse au lieu de juger seulement aujourd&rsquo;hui. Prends ça
        comme une indication, et respecte toujours l&rsquo;interdiction locale de feu.
      </p>
    ),
    text:
      "C'est calculé sur ton appareil, pas récupéré : aucun service public ne propose de prévision ponctuelle gratuite pour ça. wanderbar fait tourner l'indice forêt-météo (FWI) canadien sur 60 jours d'historique météo Open-Meteo, ce qui lui donne une mémoire de sécheresse au lieu de juger seulement aujourd'hui. Prends ça comme une indication, et respecte toujours l'interdiction locale de feu."
  },
  {
    q: "Est-ce que ça gère la rando hivernale ?",
    a: (
      <>
        <p>
          Oui. Choisis l&rsquo;allure Rando hivernale et tu as trois alertes que la version d&rsquo;été
          rate&nbsp;: pluie verglaçante, qui tombe liquide puis verglace au contact donc ça
          ne compte ni comme pluie ni comme neige&nbsp;; refroidissement éolien, calculé sur
          ton appareil à partir du modèle publié par les services météo US et canadiens,
          avec le délai de gelure indiqué dès qu&rsquo;il devient assez court pour compter&nbsp;; et
          neige au sol profonde, qui reste un danger par ciel clair et que le ciel ne te dit
          pas.
        </p>
        <p>
          Ce que l&rsquo;outil ne peut pas savoir, c&rsquo;est si quelqu&rsquo;un a déjà tracé la voie, et en
          neige profonde c&rsquo;est souvent le facteur numéro un. Les clubs alpins estiment que
          tracer une piste fraîche coûte environ un cinquième à un tiers de la journée en
          plus. wanderbar te signale la neige&nbsp;; combien de temps il te faudra dedans,
          c&rsquo;est ton appel.
        </p>
      </>
    ),
    text:
      "Oui. Choisis l'allure Rando hivernale et tu as trois alertes que la version d'été rate : pluie verglaçante, qui tombe liquide puis verglace au contact donc ça ne compte ni comme pluie ni comme neige ; refroidissement éolien, calculé sur ton appareil à partir du modèle publié par les services météo US et canadiens, avec le délai de gelure indiqué dès qu'il devient assez court pour compter ; et neige au sol profonde, qui reste un danger par ciel clair et que le ciel ne te dit pas. Ce que l'outil ne peut pas savoir, c'est si quelqu'un a déjà tracé la voie, et en neige profonde c'est souvent le facteur numéro un. Les clubs alpins estiment que tracer une piste fraîche coûte environ un cinquième à un tiers de la journée en plus. wanderbar te signale la neige ; combien de temps il te faudra dedans, c'est ton appel."
  },
  {
    q: "Est-ce que ça alerte sur les avalanches ?",
    a: (
      <>
        <p>
          Ça affiche le bulletin officiel quand il existe &mdash; SLF en Suisse,
          avalanche.report pour le Tyrol et le Trentin, Varsom en Norvège, Avalanche
          Canada &mdash; et ça renvoie directement dessus. Ce que ça ne fait jamais,
          c&rsquo;est en fabriquer un tout seul. Le danger d&rsquo;avalanche vient de la structure du
          manteau neigeux, de couches fragiles enfouies depuis des semaines, et aucune
          prévision météo ne peut les voir.
        </p>
        <p>
          Donc quand il n&rsquo;y a pas de bulletin d&rsquo;avalanche, wanderbar le dit exactement au
          lieu de se taire&nbsp;: aucun service ne couvre cet itinéraire, ou la saison est
          finie, ou le bulletin a expiré, ou il est inaccessible. Rien de tout ça ne veut
          dire que la pente est sûre. Un bulletin expiré perd carrément son niveau, parce
          que le chiffre d&rsquo;hier sur la neige d&rsquo;aujourd&rsquo;hui, c&rsquo;est la manière la plus sûre de
          te tromper.
        </p>
        <p>
          Même avec un bulletin actif, le niveau de danger est un pointeur vers le document
          réel, pas un remplaçant. wanderbar ne connaît ni l&rsquo;angle ni l&rsquo;orientation de la
          pente sur laquelle tu vas t&rsquo;engager, alors que c&rsquo;est l&rsquo;essentiel de ce qui décide
          si ça part.
        </p>
      </>
    ),
    text:
      "Ça affiche le bulletin officiel quand il existe (SLF en Suisse, avalanche.report pour le Tyrol et le Trentin, Varsom en Norvège, Avalanche Canada) et ça renvoie directement dessus. Ça n'en fabrique jamais un tout seul : le danger d'avalanche vient de la structure du manteau neigeux et de couches fragiles enfouies depuis des semaines, qu'aucune prévision météo ne peut voir. Quand il n'y a pas de bulletin d'avalanche, wanderbar le dit explicitement au lieu de se taire : aucun service ne couvre cet itinéraire, ou la saison est finie, ou le bulletin a expiré, ou il est inaccessible. Rien de tout ça ne veut dire que la pente est sûre. Un bulletin expiré perd carrément son niveau, parce que le chiffre d'hier sur la neige d'aujourd'hui est la manière la plus sûre de te tromper. Même avec un bulletin actif, le niveau de danger est un pointeur vers le document réel, pas un remplaçant : wanderbar ne connaît ni l'angle ni l'orientation de la pente sur laquelle tu vas t'engager, alors que c'est l'essentiel de ce qui décide si ça part."
  },
  {
    q: "Combien ça coûte, et qui a fait ça ?",
    a: (
      <p>
        Rien, et il n&rsquo;y a ni comptes, ni pub, ni traceurs. C&rsquo;est open source&nbsp;:{' '}
        <A href="https://github.com/boredland/wanderbar.fyi">le code est sur GitHub</A>. Les
        tuiles de carte viennent de <A href="https://opentopomap.org">OpenTopoMap</A> à
        partir des données OpenStreetMap, et les icônes météo viennent de{' '}
        <A href="https://github.com/metno/weathericons">MET Norway</A>.
      </p>
    ),
    text:
      "Rien, et il n'y a ni comptes, ni pub, ni traceurs. C'est open source : le code est sur GitHub. Les tuiles de carte viennent d'OpenTopoMap à partir des données OpenStreetMap, et les icônes météo viennent de MET Norway."
  }
]

export const FAQ_BY_LOCALE: Record<Locale, FaqEntry[]> = {
  en: faqEn,
  de: faqDe,
  fr: faqFr
}
