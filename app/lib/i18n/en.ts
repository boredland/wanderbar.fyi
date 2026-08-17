/**
 * English, and the source of truth for every key.
 *
 * `Messages` is derived from this object, so the other catalogues are checked
 * against it by the compiler: a key added here and forgotten in German is a
 * build error rather than a blank space on a mountain. Keys are grouped by
 * where they are read, because the thing a translator most needs is the
 * surrounding context and a flat alphabetical list destroys it.
 *
 * Placeholders are `{name}`; see `interpolate` in ./index.ts. There is no
 * plural machinery in the strings themselves: counts that inflect go through
 * `Intl.PluralRules`, which is why they appear here as `_one`/`_other` pairs.
 */
export const en = {
  'app.tagline': 'Weather along your route',
  'app.title': 'wanderbar - weather for the rest of your hike',
  'app.description':
    'Weather warnings for the rest of your hike: one GPX track, a pace-based ETA, and a nudge only when conditions change.',

  'lang.label': 'Language',
  'lang.switch': 'Change language',

  'bestEffort.lead': 'This is a best-effort forecast.',
  'bestEffort.body':
    'The data comes from public models and can be wrong, late or missing, and mountain weather turns faster than any forecast follows. Always check local sources too where you can: the local avalanche or weather service, the hut warden, the valley station. Treat wanderbar as one input to your own judgement, never as a reason to set out.',
  'bestEffort.hide': 'Hide the best-effort notice',

  'empty.heading': 'Add a GPX track',
  'empty.body':
    'wanderbar works out roughly where you will be along your route and shows the weather for the rest of it, warning you only when conditions change.',
  'empty.cta': 'Choose a GPX file',
  'common.loading': 'Loading…',

  'verdict.done': 'This hike is done.',
  'verdict.checking': 'Checking the weather ahead…',
  'verdict.clear': 'No un-wanderbar weather ahead.',
  'verdict.expired': 'No current forecast for the hours ahead.',
  'verdict.immediate': '{condition} from the start, at {time}.',
  'verdict.later': 'Clear until {time}, then {condition} at km {km}.',

  'stale.eyebrow': 'Old forecast',
  'stale.headingStale': 'This forecast is {age} old.',
  'stale.headingExpired': 'These numbers are {age} old and no longer describe today.',
  'stale.bodyStale':
    'Mountain weather moves faster than this. Everything below still describes the conditions expected at the last sync, not now.',
  'stale.bodyExpired':
    'A forecast this old was made for hours that have already passed. Treat everything below as history, not as what is coming.',
  'stale.online': 'You appear to be online, so a refetch should work.',
  'stale.offline':
    'You appear to be offline, so wanderbar cannot refresh it until you have signal again.',

  'fresh.lastFetched': 'Last fetched {time}, {age} ago',
  'fresh.never': 'Never fetched',
  'fresh.attemptFailed': 'last attempt failed',
  'fresh.offline': 'offline',
  'fresh.refetch': 'Refetch now',
  'fresh.refetching': 'Fetching…',

  'age.underMinute': 'under a minute',
  'age.minute_one': '{n} minute',
  'age.minute_other': '{n} minutes',
  'age.hour_one': '{n} hour',
  'age.hour_other': '{n} hours',
  'age.day_one': '{n} day',
  'age.day_other': '{n} days',

  'duration.hoursMinutes': '{h} h {m} min',
  'duration.minutes': '{m} min',

  'stats.time': 'Time',
  'stats.distance': 'Distance',
  'stats.up': 'Up',
  'stats.down': 'Down',
  'stats.eleFromGpx': 'from your GPX',
  'stats.eleFromDem': 'from elevation model',

  'position.startAssumeNow': 'Times assume you start now.',
  'position.started': 'Started {time}',
  'position.starting': 'Starting {time}',
  'position.keptPace': ' (no position yet, times assume you kept pace)',
  'position.youAreAt': 'You’re at km {km} ({time})',
  'position.estimated': '≈ km {km}, estimated from your {time} position',
  'position.offTrack': ', you appear to be >5 km off this track',
  'position.fixAge': 'Position from {time}',
  'position.fixStale': ', your position may be well off',
  'position.atKm': 'At km {km} of {total}',
  'position.update': 'Update my position',
  'position.locating': 'Locating…',
  'position.unavailable': 'Position unavailable, using planned pace.',
  'position.farOff': 'You appear to be >5 km off this track.',

  'start.label': 'Start time',
  'start.now': 'Now',
  'start.today': 'Today',
  'start.tomorrow': 'Tomorrow',

  'timeline.fetching': 'Fetching the forecast, reload in a moment.',
  'timeline.metLine': 'MET: {temp}',
  'timeline.noValue': '—',
  'timeline.metPrecip': ', {mm} mm',
  'timeline.sourcesDisagree': 'sources disagree',
  'map.tooShort': 'Track too short to map.',
  'map.offline':
    'No connection, so the map background cannot load. The route and its markers are drawn from your device.',
  'map.here': 'Estimated position',

  'avalanche.eyebrow': 'Avalanche',
  'avalanche.hide': 'Hide the avalanche notice',
  'avalanche.slopeCaveat':
    'Danger varies by slope angle and aspect, which wanderbar does not know.',
  'avalanche.readBefore': 'Read {link} before you go.',
  'avalanche.checkYourself': 'Check {link} yourself.',
  'avalanche.theOfficialBulletin': 'the official bulletin',
  'avalanche.band.above': 'above {m} m',
  'avalanche.band.below': 'below {m} m',
  'avalanche.band.overall': 'overall',
  /*
   * The bulletin is relayed in the language its service publishes, which is
   * often not the reader's. Saying so is the honest move: silently showing
   * German prose to a French reader looks like a bug, and machine-translating
   * an official safety document is not something wanderbar will do.
   */
  'avalanche.sourceLanguage': 'Quoted as published by the issuing service.',
  'avalanche.head.noCoverage': 'No avalanche bulletin covers this route',
  'avalanche.head.outOfSeason': 'No bulletin published right now',
  'avalanche.head.stale': 'The bulletin we found is out of date',
  'avalanche.head.error': 'Could not reach the avalanche service',
  'avalanche.body.noCoverage':
    'wanderbar has no official source for this area, so it cannot tell you anything about avalanche danger. That is not the same as safe.',
  'avalanche.body.outOfSeason':
    'The service covering this area is not publishing today, which is normal outside winter. Snow can still slide, and this is not an all-clear.',
  'avalanche.body.stale':
    'It is outside its validity window, so it describes past snow, not today. wanderbar will not show an out-of-date danger level.',
  'avalanche.body.error':
    'This may just be a dropped connection. wanderbar has no danger level for this route, which is not the same as no danger.',

  'wildfire.eyebrow': 'Active fires',
  'wildfire.hide': 'Hide the active-fire notice',
  'wildfire.nearest': 'Fire detected {km} km from your route',
  'wildfire.nearestUnderKm': 'Fire detected less than 1 km from your route',
  'wildfire.manyNearby': 'Many fires burning around this route',
  'wildfire.truncated':
    'There were more detections than wanderbar could read at once, so it cannot tell you which is nearest.',
  'wildfire.seen_one': '{n} detection in the last {hours} h, seen {ago}.',
  'wildfire.seen_other':
    '{n} detections in the last {hours} h; the nearest was seen {ago}.',
  'wildfire.withinHour': 'within the hour',
  'wildfire.hoursAgo': '{n} h ago',
  /*
   * The burnt area, not the hotspot: a mapped footprint of ground that has
   * already burnt. "Burnt area" rather than "fire", because the flames may be
   * out while the closure, the unstable ground and the smoke are not.
   */
  'wildfire.burnHead': 'Burnt ground mapped near your route',
  'wildfire.burnHeadInside': 'Your route crosses a burnt area',
  'wildfire.burnInside': 'Your route runs through the mapped burnt area.',
  'wildfire.burnUnderKm': 'A mapped burnt area lies less than 1 km from your route.',
  'wildfire.burnNear': 'A mapped burnt area lies {km} km from your route.',
  'wildfire.burnArea': '{ha} ha burnt so far',
  'wildfire.confidence.low': 'low confidence',
  'wildfire.confidence.nominal': 'nominal confidence',
  'wildfire.confidence.high': 'high confidence',
  /*
   * The distance is to where a satellite saw heat, at one instant. It is not a
   * clearance, and the fire may have moved since; the people who model spread
   * are the ones to ask, so every state links to them.
   */
  'wildfire.caveat':
    'That is where a satellite saw heat, not where the fire is now, and wanderbar cannot tell you which way it is moving.',
  'wildfire.burnCaveat':
    'That is where the ground has already burnt, not where the fire is now, and wanderbar cannot tell you which way it is moving.',
  'wildfire.checkYourself': 'Check {link} and local civil protection.',
  'wildfire.head.none': 'No fires detected near this route',
  'wildfire.head.error': 'Could not check for active fires',
  'wildfire.body.none':
    'No satellite detected a fire within 20 km of your route in the last {hours} h. Satellites pass a few times a day and cloud hides fires, so this is not a guarantee that nothing is burning.',
  'wildfire.body.error':
    'This may just be a dropped connection. wanderbar does not know whether anything is burning near this route, which is not the same as nothing burning.',

  'danger.1': 'Low',
  'danger.2': 'Moderate',
  'danger.3': 'Considerable',
  'danger.4': 'High',
  'danger.5': 'Very high',

  'condition.rain': 'Rain',
  'condition.hail': 'Hail',
  'condition.wind': 'Wind',
  'condition.snow': 'Snow',
  'condition.heat': 'Heat',
  'condition.blizzard': 'Blizzard',
  'condition.thunderstorm': 'Thunderstorm',
  'condition.darkness': 'Darkness',
  'condition.fire': 'Fire danger',
  'condition.lightning': 'Dry lightning',
  'condition.ice': 'Freezing rain',
  'condition.coldwind': 'Wind chill',
  'condition.deepsnow': 'Deep snow',

  'source.open-meteo': 'Open-Meteo',
  'source.met': 'MET',
  'source.open-meteo+met': 'Open-Meteo + MET',
  'source.effis': 'Copernicus EFFIS',
  'source.computed': 'computed here',

  'detail.rainRate': '{mm} mm/h',
  'detail.hailPossible': 'possible',
  'detail.gusts': 'gusts {kmh} km/h',
  'detail.snowfall': '{cm} cm',
  'detail.snowExpected': 'expected',
  'detail.blizzard': 'gusts {kmh} km/h at {temp} °C',
  'detail.lyingSnow': '{cm} cm lying',
  'detail.heat': '{temp} °C',
  'detail.fire': '{danger}, FWI {fwi}',
  'detail.lightning': '{band}, {flashes} strikes/km²',
  'detail.fireUnusual': 'worse than {pct}% of days here at this time of year',
  'detail.windChill': 'feels like {temp} °C',
  'detail.windChillFrostbite': 'feels like {temp} °C, frostbite {band}',
  'detail.sunrise': 'sunrise {time}',
  'detail.beforeSunrise': 'before sunrise {time}',
  'detail.afterSunset': 'after sunset {time}',
  'detail.dusk': 'dusk, sunset {time}',

  /*
   * EFFIS's own legend wording for the lightning layer, so a reader comparing
   * wanderbar against the EFFIS map finds the same words.
   */
  'lightningBand.very low': 'very low',
  'lightningBand.low': 'low',
  'lightningBand.moderate': 'moderate',
  'lightningBand.high': 'high',
  'lightningBand.very high': 'very high',
  'lightningBand.extreme': 'extreme',
  'frostbite.under2': 'under 2 min',
  'frostbite.2to5': '2-5 min',
  'frostbite.5to10': '5-10 min',
  'frostbite.10to30': '10-30 min',

  'instability.expected': 'expected',
  'instability.weak': 'weak updrafts',
  'instability.strong': 'strong updrafts',
  'instability.violent': 'violent updrafts',
  'instability.extreme': 'extreme updrafts',

  'ice.56': 'freezing drizzle',
  'ice.57': 'dense freezing drizzle',
  'ice.66': 'freezing rain',
  'ice.67': 'heavy freezing rain',

  'fireDanger.very low': 'very low',
  'fireDanger.low': 'low',
  'fireDanger.moderate': 'moderate',
  'fireDanger.high': 'high',
  'fireDanger.very high': 'very high',
  'fireDanger.extreme': 'extreme',

  'profile.hiking': 'Hiking',
  'profile.mountain': 'Mountain hiking',
  'profile.winter': 'Winter hiking',
  'profile.running': 'Trail running',
  'profile.cycling': 'Cycling',
  'profile.ski': 'Ski touring',

  'rest.none': 'No stops',
  'rest.short': 'Short breaks',
  'rest.normal': 'Normal breaks',
  'rest.leisurely': 'Long breaks',
  'rest.movingTimeOnly': 'The pace standards count moving time only.',

  'panel.newTrack': 'New track',
  'panel.thisTrack': 'This track',
  'panel.warningSettings': 'Warning settings',
  'panel.background': 'Background checks',
  'panel.questions': 'Questions',

  'upload.file': 'GPX track',
  'upload.name': 'Name (optional)',
  'upload.start': 'Start',
  'upload.profile': 'Pace profile',
  'upload.breaks': 'Breaks',
  'upload.submit': 'Add track',
  'upload.adding': 'Adding…',
  'upload.chooseFirst': 'Choose a .gpx file first.',
  'upload.unreadable': 'Could not read that file.',
  'upload.unparseable': 'Could not parse this file as GPX.',
  'upload.sparse':
    'This GPX looks like a route, not a recorded track. Please export a track with dense trackpoints (<200 m apart).',

  'manage.name': 'Name',
  'manage.nameThis': 'Name this hike',
  'manage.save': 'Save',
  'manage.delete': 'Delete this track',
  'manage.confirmDelete': 'Delete “{name}”?',

  'settings.lightningFrom': 'Lightning from',
  'settings.fireDangerFrom': 'Fire danger from',
  'settings.heatAbove': 'Heat above (°C)',
  'settings.windChillBelow': 'Wind chill below (°C)',
  'settings.lyingSnowAbove': 'Lying snow above (m)',
  'settings.gustsAbove': 'Gusts above (km/h)',
  'settings.rainAbove': 'Rain above (mm/h)',
  'settings.enableFirst': 'Enable {condition} to set this',

  'schedule.enable': 'Check in the background',
  'schedule.every': 'Every',
  'schedule.from': 'From',
  'schedule.to': 'To',
  'schedule.hours': '{n} h',
  'schedule.invalidRange': 'The start hour must come before the end hour.',
  'schedule.enabling': 'Enabling…',
  'schedule.nextCheck': 'Next check {time}.',
  'schedule.saveFailed': 'Could not save that schedule.',
  'schedule.blocked': 'Notifications are blocked for this site.',
  'schedule.off': 'Background checks are off.',
  'schedule.unsupported': 'This browser cannot do background checks.',

  'capability.onWhileOpen': 'Warnings appear while wanderbar is open.',
  'capability.background': ' Background checks run every {n} h between {from} and {to}.',
  'capability.enableToBackground': ' Enable notifications to be warned in the background.',

  'notify.worsened': 'Un-wanderbar weather ahead',
  'notify.clearing': 'Weather is clearing',
  'notify.atKm': 'km {km}',
  'notify.atPoint': 'point {seq}',
  'notify.more': '+{n} more',
  'notify.lifted_one': '… and {n} warning lifted',
  'notify.lifted_other': '… and {n} warnings lifted',

  'share.adding': 'Adding your track…',
  'share.back': 'Back to wanderbar',
  'share.noFile': 'No file arrived with that share.',
  'share.tooLarge': 'That file is too large (5 MB max).',

  'error.notFound.title': 'Page not found',
  'error.notFound.body':
    'That address does not exist. wanderbar has a single screen: your track and the weather along it.',
  'error.broke.title': 'Something broke',
  'error.broke.body':
    'That is on us, not on you. Your track and settings are stored on your device and are unaffected, so reloading is safe.',
  'error.back': 'Back to your track',

  'credits.weatherBy': 'Weather data by',
  'credits.crossCheck': 'Cross-check from the Norwegian Meteorological Institute / Yr',
  'credits.icons': 'Weather icons ©',
  'credits.source': 'Source on GitHub'
} as const

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
