import type { Messages } from './en'

/**
 * German.
 *
 * Typed as `Messages`, so a key added to ./en and forgotten here is a build
 * error rather than a blank line on a mountain.
 *
 * Register follows the English: plain, direct, second person, and never
 * reassuring about danger. "wanderbar" is left untranslated throughout — it is
 * the product name, and the pun in "un-wanderbar weather" does not survive
 * translation, so the German states the same fact without reaching for a joke.
 */
export const de: Messages = {
  'app.tagline': 'Wetter entlang deiner Route',
  'app.title': 'wanderbar - Wetter für den Rest deiner Tour',
  'app.description':
    'Wetterwarnungen für den Rest deiner Tour: ein GPX-Track, eine Ankunftszeit nach Gehzeitformel, und ein Hinweis nur dann, wenn sich die Bedingungen ändern.',

  'lang.label': 'Sprache',
  'lang.switch': 'Sprache wechseln',

  'bestEffort.lead': 'Das ist eine Prognose nach bestem Wissen.',
  'bestEffort.body':
    'Die Daten stammen aus öffentlichen Modellen und können falsch, verspätet oder gar nicht vorhanden sein, und Bergwetter schlägt schneller um, als jede Prognose folgen kann. Zieh immer auch lokale Quellen heran, wo es geht: den örtlichen Lawinen- oder Wetterdienst, den Hüttenwirt, die Talstation. Nimm wanderbar als einen Beitrag zu deiner eigenen Einschätzung, nie als Grund loszugehen.',
  'bestEffort.hide': 'Hinweis ausblenden',

  'empty.heading': 'GPX-Track hinzufügen',
  'empty.body':
    'wanderbar schätzt ab, wo du auf deiner Route ungefähr sein wirst, und zeigt das Wetter für den Rest davon. Gewarnt wirst du nur, wenn sich die Bedingungen ändern.',
  'empty.cta': 'GPX-Datei auswählen',
  'common.loading': 'Lädt…',

  'verdict.done': 'Diese Tour ist beendet.',
  'verdict.checking': 'Wetter voraus wird geprüft…',
  'verdict.clear': 'Kein un-wanderbares Wetter voraus.',
  'verdict.expired': 'Keine aktuelle Prognose für die kommenden Stunden.',
  'verdict.immediate': '{condition} von Anfang an, um {time}.',
  'verdict.later': 'Bis {time} frei, dann {condition} bei km {km}.',

  'stale.eyebrow': 'Alte Prognose',
  'stale.headingStale': 'Diese Prognose ist {age} alt.',
  'stale.headingExpired': 'Diese Werte sind {age} alt und beschreiben nicht mehr den heutigen Tag.',
  'stale.bodyStale':
    'Bergwetter ändert sich schneller als das. Alles unten beschreibt weiterhin die Bedingungen, die beim letzten Abgleich erwartet wurden, nicht die von jetzt.',
  'stale.bodyExpired':
    'Eine so alte Prognose wurde für Stunden erstellt, die bereits vorbei sind. Betrachte alles unten als Vergangenheit, nicht als das, was kommt.',
  'stale.online': 'Du scheinst online zu sein, ein neuer Abruf sollte klappen.',
  'stale.offline':
    'Du scheinst offline zu sein, deshalb kann wanderbar die Prognose erst wieder aktualisieren, wenn du Empfang hast.',

  'fresh.lastFetched': 'Zuletzt abgerufen {time}, vor {age}',
  'fresh.never': 'Nie abgerufen',
  'fresh.attemptFailed': 'letzter Versuch fehlgeschlagen',
  'fresh.offline': 'offline',
  'fresh.refetch': 'Jetzt neu abrufen',
  'fresh.refetching': 'Wird abgerufen…',

  'age.underMinute': 'unter einer Minute',
  'age.minute_one': '{n} Minute',
  'age.minute_other': '{n} Minuten',
  'age.hour_one': '{n} Stunde',
  'age.hour_other': '{n} Stunden',
  'age.day_one': '{n} Tag',
  'age.day_other': '{n} Tagen',

  'duration.hoursMinutes': '{h} Std {m} Min',
  'duration.minutes': '{m} Min',

  'stats.time': 'Zeit',
  'stats.distance': 'Distanz',
  'stats.up': 'Aufstieg',
  'stats.down': 'Abstieg',
  'stats.eleFromGpx': 'aus deiner GPX-Datei',
  'stats.eleFromDem': 'aus Höhenmodell',

  'position.startAssumeNow': 'Zeiten gelten ab Start jetzt.',
  'position.started': 'Gestartet {time}',
  'position.starting': 'Start {time}',
  'position.keptPace': ' (noch keine Position, Zeiten gelten bei gehaltenem Tempo)',
  'position.youAreAt': 'Du bist bei km {km} ({time})',
  'position.estimated': '≈ km {km}, geschätzt aus deiner Position von {time}',
  'position.offTrack': ', du scheinst mehr als 5 km von diesem Track entfernt zu sein',
  'position.fixAge': 'Position von {time}',
  'position.fixStale': ', deine Position kann deutlich abweichen',
  'position.atKm': 'Bei km {km} von {total}',
  'position.update': 'Meine Position aktualisieren',
  'position.locating': 'Wird geortet…',
  'position.unavailable': 'Position nicht verfügbar, es gilt das geplante Tempo.',
  'position.farOff': 'Du scheinst mehr als 5 km von diesem Track entfernt zu sein.',

  'start.label': 'Startzeit',
  'start.now': 'Jetzt',
  'start.today': 'Heute',
  'start.tomorrow': 'Morgen',

  'timeline.fetching': 'Prognose wird geladen, lade gleich neu.',
  'timeline.metLine': 'MET: {temp}',
  'timeline.noValue': '—',
  'timeline.metPrecip': ', {mm} mm',
  'timeline.sourcesDisagree': 'Quellen widersprechen sich',
  'map.tooShort': 'Track zu kurz für die Karte.',
  'map.offline':
    'Keine Verbindung, deshalb kann der Kartenhintergrund nicht geladen werden. Die Route und ihre Marker kommen von deinem Gerät.',
  'map.here': 'Geschätzte Position',

  'avalanche.eyebrow': 'Lawinen',
  'avalanche.hide': 'Lawinenhinweis ausblenden',
  'avalanche.slopeCaveat':
    'Die Gefahr hängt von Hangneigung und Exposition ab, die wanderbar nicht kennt.',
  'avalanche.readBefore': 'Lies {link}, bevor du losgehst.',
  'avalanche.checkYourself': 'Prüfe {link} selbst.',
  'avalanche.theOfficialBulletin': 'den offiziellen Lawinenbericht',
  'avalanche.band.above': 'oberhalb {m} m',
  'avalanche.band.below': 'unterhalb {m} m',
  'avalanche.band.overall': 'insgesamt',
  'avalanche.sourceLanguage': 'Wiedergegeben so, wie der herausgebende Dienst es veröffentlicht.',
  'avalanche.head.noCoverage': 'Kein Lawinenbericht deckt diese Route ab',
  'avalanche.head.outOfSeason': 'Derzeit wird kein Bericht veröffentlicht',
  'avalanche.head.stale': 'Der gefundene Bericht ist nicht mehr aktuell',
  'avalanche.head.error': 'Der Lawinendienst war nicht erreichbar',
  'avalanche.body.noCoverage':
    'wanderbar hat für dieses Gebiet keine offizielle Quelle und kann dir deshalb nichts über die Lawinengefahr sagen. Das ist nicht dasselbe wie sicher.',
  'avalanche.body.outOfSeason':
    'Der zuständige Dienst veröffentlicht heute nicht, was außerhalb des Winters normal ist. Schnee kann trotzdem abgehen, und das ist keine Entwarnung.',
  'avalanche.body.stale':
    'Er liegt außerhalb seines Gültigkeitszeitraums und beschreibt damit vergangenen Schnee, nicht den heutigen. wanderbar zeigt keine veraltete Gefahrenstufe an.',
  'avalanche.body.error':
    'Das kann auch nur eine abgebrochene Verbindung sein. wanderbar hat keine Gefahrenstufe für diese Route, was nicht dasselbe ist wie keine Gefahr.',

  'wildfire.eyebrow': 'Aktive Brände',
  'wildfire.hide': 'Hinweis zu aktiven Bränden ausblenden',
  'wildfire.nearest': 'Feuer {km} km von deiner Route entdeckt',
  'wildfire.nearestUnderKm': 'Feuer weniger als 1 km von deiner Route entdeckt',
  'wildfire.manyNearby': 'Viele Brände rund um diese Route',
  'wildfire.truncated':
    'Es gab mehr Detektionen, als wanderbar auf einmal lesen konnte, deshalb kann es dir nicht sagen, welche die nächstgelegene ist.',
  'wildfire.seen_one': '{n} Detektion in den letzten {hours} h, gesehen {ago}.',
  'wildfire.seen_other':
    '{n} Detektionen in den letzten {hours} h; die nächstgelegene wurde {ago} gesehen.',
  'wildfire.withinHour': 'in der letzten Stunde',
  'wildfire.hoursAgo': 'vor {n} h',
  /*
   * The satellite's own confidence in the detection, not confidence in the
   * fire: "Vertrauen" would read as the latter. VIIRS publishes low/nominal/
   * high, and "nominal" is the sensor's normal case, not a middling warning.
   */
  'wildfire.confidence.low': 'geringe Zuverlässigkeit',
  'wildfire.confidence.nominal': 'normale Zuverlässigkeit',
  'wildfire.confidence.high': 'hohe Zuverlässigkeit',
  'wildfire.caveat':
    'Dort hat ein Satellit Hitze gesehen, nicht dort ist das Feuer jetzt, und wanderbar kann dir nicht sagen, wohin es zieht.',
  'wildfire.checkYourself': 'Prüfe {link} und den örtlichen Katastrophenschutz.',
  'wildfire.head.none': 'Keine Brände in der Nähe dieser Route entdeckt',
  'wildfire.head.error': 'Aktive Brände konnten nicht geprüft werden',
  'wildfire.body.none':
    'In den letzten {hours} h hat kein Satellit ein Feuer im Umkreis von 20 km um deine Route entdeckt. Satelliten fliegen nur einige Male am Tag vorbei, und Wolken verdecken Brände: Das ist keine Garantie, dass nichts brennt.',
  'wildfire.body.error':
    'Das kann auch nur eine abgebrochene Verbindung sein. wanderbar weiß nicht, ob in der Nähe dieser Route etwas brennt, was nicht dasselbe ist wie: es brennt nichts.',

  /*
   * The EAWS danger scale, in its official German wording — not a translation
   * choice. avalanche.report publishes exactly these five words, and a reader
   * comparing wanderbar against the bulletin must find the same term. (SLF
   * spells the Swiss forms Mässig/Gross; the ß forms are the EAWS standard.)
   */
  'danger.1': 'Gering',
  'danger.2': 'Mäßig',
  'danger.3': 'Erheblich',
  'danger.4': 'Groß',
  'danger.5': 'Sehr groß',

  'condition.rain': 'Regen',
  'condition.hail': 'Hagel',
  'condition.wind': 'Wind',
  'condition.snow': 'Schnee',
  'condition.heat': 'Hitze',
  'condition.blizzard': 'Schneesturm',
  'condition.thunderstorm': 'Gewitter',
  'condition.darkness': 'Dunkelheit',
  'condition.fire': 'Waldbrandgefahr',
  'condition.ice': 'Gefrierender Regen',
  'condition.coldwind': 'Windchill',
  'condition.deepsnow': 'Tiefschnee',

  'source.open-meteo': 'Open-Meteo',
  'source.met': 'MET',
  'source.open-meteo+met': 'Open-Meteo + MET',
  'source.computed': 'hier berechnet',

  'detail.rainRate': '{mm} mm/h',
  'detail.hailPossible': 'möglich',
  'detail.gusts': 'Böen {kmh} km/h',
  'detail.snowfall': '{cm} cm',
  'detail.snowExpected': 'erwartet',
  'detail.blizzard': 'Böen {kmh} km/h bei {temp} °C',
  'detail.lyingSnow': '{cm} cm Schneelage',
  'detail.heat': '{temp} °C',
  'detail.fire': '{danger}, FWI {fwi}',
  'detail.windChill': 'gefühlt {temp} °C',
  'detail.windChillFrostbite': 'gefühlt {temp} °C, Erfrierungen {band}',
  'detail.sunrise': 'Sonnenaufgang {time}',
  'detail.beforeSunrise': 'vor Sonnenaufgang {time}',
  'detail.afterSunset': 'nach Sonnenuntergang {time}',
  'detail.dusk': 'Dämmerung, Sonnenuntergang {time}',

  'frostbite.under2': 'unter 2 Min',
  'frostbite.2to5': '2-5 Min',
  'frostbite.5to10': '5-10 Min',
  'frostbite.10to30': '10-30 Min',

  'instability.expected': 'erwartet',
  'instability.weak': 'schwache Aufwinde',
  'instability.strong': 'starke Aufwinde',
  'instability.violent': 'heftige Aufwinde',
  'instability.extreme': 'extreme Aufwinde',

  'ice.56': 'gefrierender Sprühregen',
  'ice.57': 'dichter gefrierender Sprühregen',
  'ice.66': 'gefrierender Regen',
  'ice.67': 'starker gefrierender Regen',

  /* EFFIS/Copernicus fire-danger classes, official German wording. */
  'fireDanger.very low': 'sehr gering',
  'fireDanger.low': 'gering',
  'fireDanger.moderate': 'mäßig',
  'fireDanger.high': 'hoch',
  'fireDanger.very high': 'sehr hoch',
  'fireDanger.extreme': 'extrem',

  'profile.hiking': 'Wandern',
  'profile.mountain': 'Bergwandern',
  'profile.winter': 'Winterwandern',
  'profile.running': 'Trailrunning',
  'profile.cycling': 'Radfahren',
  'profile.ski': 'Skitour',

  'rest.none': 'Keine Pausen',
  'rest.short': 'Kurze Pausen',
  'rest.normal': 'Normale Pausen',
  'rest.leisurely': 'Lange Pausen',
  'rest.movingTimeOnly': 'Die Gehzeitformeln rechnen nur reine Gehzeit.',

  'panel.newTrack': 'Neuer Track',
  'panel.thisTrack': 'Dieser Track',
  'panel.warningSettings': 'Warnungen',
  'panel.background': 'Prüfung im Hintergrund',
  'panel.questions': 'Fragen',

  'upload.file': 'GPX-Track',
  'upload.name': 'Name (optional)',
  'upload.start': 'Start',
  'upload.profile': 'Gehzeitprofil',
  'upload.breaks': 'Pausen',
  'upload.submit': 'Track hinzufügen',
  'upload.adding': 'Wird hinzugefügt…',
  'upload.chooseFirst': 'Wähle zuerst eine .gpx-Datei.',
  'upload.unreadable': 'Diese Datei konnte nicht gelesen werden.',
  'upload.unparseable': 'Diese Datei konnte nicht als GPX gelesen werden.',
  'upload.sparse':
    'Diese GPX-Datei sieht nach einer Route aus, nicht nach einem aufgezeichneten Track. Bitte exportiere einen Track mit dichten Trackpunkten (unter 200 m Abstand).',

  'manage.name': 'Name',
  'manage.nameThis': 'Diese Tour benennen',
  'manage.save': 'Speichern',
  'manage.delete': 'Diesen Track löschen',
  'manage.confirmDelete': '„{name}“ löschen?',

  'settings.fireDangerFrom': 'Waldbrandgefahr ab',
  'settings.heatAbove': 'Hitze über (°C)',
  'settings.windChillBelow': 'Windchill unter (°C)',
  'settings.lyingSnowAbove': 'Schneelage über (m)',
  'settings.gustsAbove': 'Böen über (km/h)',
  'settings.rainAbove': 'Regen über (mm/h)',
  'settings.enableFirst': 'Aktiviere {condition}, um das zu setzen',

  'schedule.enable': 'Im Hintergrund prüfen',
  'schedule.every': 'Alle',
  'schedule.from': 'Von',
  'schedule.to': 'Bis',
  'schedule.hours': '{n} Std',
  'schedule.invalidRange': 'Die Startstunde muss vor der Endstunde liegen.',
  'schedule.enableButton': 'Benachrichtigungen aktivieren',
  'schedule.enabling': 'Wird aktiviert…',
  'schedule.nextCheck': 'Nächste Prüfung {time}.',
  'schedule.saveFailed': 'Dieser Zeitplan konnte nicht gespeichert werden.',
  'schedule.blocked': 'Benachrichtigungen sind für diese Seite blockiert.',
  'schedule.off': 'Prüfung im Hintergrund ist aus.',
  'schedule.unsupported': 'Dieser Browser kann nicht im Hintergrund prüfen.',

  'capability.onWhileOpen': 'Warnungen erscheinen, solange wanderbar geöffnet ist.',
  'capability.background': ' Im Hintergrund wird alle {n} Std zwischen {from} und {to} geprüft.',
  'capability.enableToBackground':
    ' Aktiviere Benachrichtigungen, um auch im Hintergrund gewarnt zu werden.',

  'notify.worsened': 'Un-wanderbares Wetter voraus',
  'notify.clearing': 'Das Wetter bessert sich',
  'notify.atKm': 'km {km}',
  'notify.atPoint': 'Punkt {seq}',
  'notify.more': '+{n} weitere',
  'notify.lifted_one': '… und {n} Warnung aufgehoben',
  'notify.lifted_other': '… und {n} Warnungen aufgehoben',

  'share.adding': 'Track wird hinzugefügt…',
  'share.back': 'Zurück zu wanderbar',
  'share.noFile': 'Mit dieser Freigabe kam keine Datei an.',
  'share.tooLarge': 'Diese Datei ist zu groß (max. 5 MB).',

  'error.notFound.title': 'Seite nicht gefunden',
  'error.notFound.body':
    'Diese Adresse gibt es nicht. wanderbar hat genau einen Bildschirm: deinen Track und das Wetter entlang davon.',
  'error.broke.title': 'Da ist etwas kaputtgegangen',
  'error.broke.body':
    'Das liegt an uns, nicht an dir. Dein Track und deine Einstellungen liegen auf deinem Gerät und sind nicht betroffen, Neuladen ist also unbedenklich.',
  'error.back': 'Zurück zu deinem Track',

  'credits.weatherBy': 'Wetterdaten von',
  'credits.crossCheck': 'Gegenprüfung vom Norwegischen Meteorologischen Institut / Yr',
  'credits.icons': 'Wettersymbole ©',
  'credits.source': 'Quellcode auf GitHub'
}
