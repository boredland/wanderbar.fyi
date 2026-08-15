import type { Messages } from './en'

/**
 * French.
 *
 * Typed as `Messages`, so a key added to ./en and forgotten here is a build
 * error rather than a blank line on a mountain.
 *
 * Tutoiement throughout, matching the German and the English's directness: this
 * is mountain-sports register, where the formal voice would sound like an
 * insurance policy. "wanderbar" stays untranslated as the product name, and the
 * pun in "un-wanderbar weather" is not attempted — the French states the fact.
 */
export const fr: Messages = {
  'app.tagline': 'La météo le long de ton itinéraire',
  'app.title': 'wanderbar - la météo pour le reste de ta randonnée',
  'app.description':
    "Des alertes météo pour le reste de ta randonnée : une trace GPX, une heure d'arrivée calculée selon ton allure, et un signal uniquement quand les conditions changent.",

  'lang.label': 'Langue',
  'lang.switch': 'Changer de langue',

  'bestEffort.lead': "Cette prévision est fournie au mieux de nos moyens.",
  'bestEffort.body':
    "Les données viennent de modèles publics et peuvent être fausses, tardives ou absentes, et la météo de montagne tourne plus vite que n'importe quelle prévision ne la suit. Consulte aussi les sources locales dès que tu le peux : le service d'avalanches ou de météo local, le gardien de refuge, la station de la vallée. Considère wanderbar comme un élément de ton propre jugement, jamais comme une raison de partir.",
  'bestEffort.hide': "Masquer cet avertissement",

  'empty.heading': 'Ajouter une trace GPX',
  'empty.body':
    "wanderbar estime approximativement où tu seras le long de ton itinéraire et affiche la météo pour le reste du parcours, en t'alertant uniquement quand les conditions changent.",
  'empty.cta': 'Choisir un fichier GPX',
  'common.loading': 'Chargement…',

  'verdict.done': 'Cette randonnée est terminée.',
  'verdict.checking': 'Vérification de la météo à venir…',
  'verdict.clear': 'Pas de météo un-wanderbar à venir.',
  'verdict.expired': 'Aucune prévision à jour pour les heures à venir.',
  'verdict.immediate': '{condition} dès le départ, à {time}.',
  'verdict.later': "Dégagé jusqu'à {time}, puis {condition} au km {km}.",

  'stale.eyebrow': 'Prévision ancienne',
  'stale.headingStale': 'Cette prévision date de {age}.',
  'stale.headingExpired': "Ces chiffres datent de {age} et ne décrivent plus la journée d'aujourd'hui.",
  'stale.bodyStale':
    "La météo de montagne évolue plus vite que ça. Tout ce qui suit décrit encore les conditions attendues lors de la dernière synchronisation, pas celles de maintenant.",
  'stale.bodyExpired':
    "Une prévision aussi ancienne a été établie pour des heures déjà passées. Considère tout ce qui suit comme de l'historique, pas comme ce qui arrive.",
  'stale.online': 'Tu sembles être en ligne, une nouvelle récupération devrait fonctionner.',
  'stale.offline':
    "Tu sembles être hors ligne, wanderbar ne pourra donc pas actualiser la prévision avant que tu aies du réseau.",

  'fresh.lastFetched': 'Récupéré à {time}, il y a {age}',
  'fresh.never': 'Jamais récupéré',
  'fresh.attemptFailed': 'dernière tentative échouée',
  'fresh.offline': 'hors ligne',
  'fresh.refetch': 'Récupérer maintenant',
  'fresh.refetching': 'Récupération…',

  'age.underMinute': "moins d'une minute",
  'age.minute_one': '{n} minute',
  'age.minute_other': '{n} minutes',
  'age.hour_one': '{n} heure',
  'age.hour_other': '{n} heures',
  'age.day_one': '{n} jour',
  'age.day_other': '{n} jours',

  'duration.hoursMinutes': '{h} h {m} min',
  'duration.minutes': '{m} min',

  'stats.time': 'Durée',
  'stats.distance': 'Distance',
  'stats.up': 'Dénivelé +',
  'stats.down': 'Dénivelé -',
  'stats.eleFromGpx': 'depuis ton fichier GPX',
  'stats.eleFromDem': "depuis le modèle d'élévation",

  'position.startAssumeNow': 'Les horaires supposent un départ maintenant.',
  'position.started': 'Parti à {time}',
  'position.starting': 'Départ à {time}',
  'position.keptPace': " (pas encore de position, les horaires supposent l'allure tenue)",
  'position.youAreAt': 'Tu es au km {km} ({time})',
  'position.estimated': '≈ km {km}, estimé depuis ta position de {time}',
  'position.offTrack': ', tu sembles être à plus de 5 km de cette trace',
  'position.fixAge': 'Position de {time}',
  'position.fixStale': ', ta position peut être très décalée',
  'position.atKm': 'Au km {km} sur {total}',
  'position.update': 'Actualiser ma position',
  'position.locating': 'Localisation…',
  'position.unavailable': "Position indisponible, l'allure prévue est utilisée.",
  'position.farOff': 'Tu sembles être à plus de 5 km de cette trace.',

  'start.label': 'Heure de départ',
  'start.now': 'Maintenant',
  'start.today': "Aujourd'hui",
  'start.tomorrow': 'Demain',

  'timeline.fetching': 'Récupération de la prévision, recharge dans un instant.',
  'timeline.metLine': 'MET : {temp}',
  'timeline.noValue': '—',
  'timeline.metPrecip': ', {mm} mm',
  'timeline.sourcesDisagree': 'les sources divergent',
  'map.tooShort': 'Trace trop courte pour la carte.',
  'map.offline':
    "Pas de connexion, le fond de carte ne peut donc pas se charger. L'itinéraire et ses marqueurs sont tracés depuis ton appareil.",
  'map.here': 'Position estimée',

  'avalanche.eyebrow': 'Avalanches',
  'avalanche.hide': "Masquer l'avis d'avalanche",
  'avalanche.slopeCaveat':
    "Le danger varie selon l'inclinaison et l'orientation de la pente, que wanderbar ne connaît pas.",
  'avalanche.readBefore': 'Lis {link} avant de partir.',
  'avalanche.checkYourself': 'Consulte {link} toi-même.',
  'avalanche.theOfficialBulletin': "le bulletin officiel",
  'avalanche.band.above': 'au-dessus de {m} m',
  'avalanche.band.below': 'en dessous de {m} m',
  'avalanche.band.overall': 'global',
  'avalanche.sourceLanguage': "Reproduit tel que publié par le service émetteur.",
  'avalanche.head.noCoverage': "Aucun bulletin d'avalanche ne couvre cet itinéraire",
  'avalanche.head.outOfSeason': "Aucun bulletin publié actuellement",
  'avalanche.head.stale': "Le bulletin trouvé n'est plus à jour",
  'avalanche.head.error': "Le service d'avalanches est injoignable",
  'avalanche.body.noCoverage':
    "wanderbar n'a pas de source officielle pour cette zone et ne peut donc rien te dire du danger d'avalanche. Ce n'est pas la même chose que sûr.",
  /*
   * "partir" is the verb SLF's own French bulletins use in narrative text
   * ("de petites avalanches peuvent partir spontanément"). It reads colloquial
   * to a machine translator, which renders it "leave"; it is not. Do not
   * "correct" it to glisser, which means glide-snow specifically.
   */
  'avalanche.body.outOfSeason':
    "Le service couvrant cette zone ne publie pas aujourd'hui, ce qui est normal hors de l'hiver. La neige peut quand même partir, et ce n'est pas un feu vert.",
  'avalanche.body.stale':
    "Il est hors de sa période de validité et décrit donc la neige d'hier, pas celle d'aujourd'hui. wanderbar n'affiche pas de degré de danger périmé.",
  'avalanche.body.error':
    "Ce n'est peut-être qu'une connexion interrompue. wanderbar n'a pas de degré de danger pour cet itinéraire, ce qui n'est pas la même chose qu'une absence de danger.",

  'wildfire.eyebrow': 'Incendies actifs',
  'wildfire.hide': "Masquer l'avis d'incendie actif",
  'wildfire.nearest': 'Incendie détecté à {km} km de ton itinéraire',
  'wildfire.nearestUnderKm': "Incendie détecté à moins d'1 km de ton itinéraire",
  'wildfire.manyNearby': 'De nombreux incendies autour de cet itinéraire',
  'wildfire.truncated':
    "Il y avait plus de détections que wanderbar ne pouvait en lire d'un coup, donc il ne peut pas te dire laquelle est la plus proche.",
  'wildfire.seen_one': '{n} détection ces dernières {hours} h, vue {ago}.',
  'wildfire.seen_other':
    '{n} détections ces dernières {hours} h ; la plus proche a été vue {ago}.',
  'wildfire.withinHour': "dans la dernière heure",
  'wildfire.hoursAgo': 'il y a {n} h',
  /*
   * The sensor's confidence in its own detection, not confidence about the
   * fire: "confiance" alone reads as the latter. VIIRS publishes low/nominal/
   * high, where "nominal" is the sensor's normal case, not a middling warning.
   */
  'wildfire.confidence.low': 'fiabilité faible',
  'wildfire.confidence.nominal': 'fiabilité normale',
  'wildfire.confidence.high': 'fiabilité élevée',
  'wildfire.caveat':
    "C'est là qu'un satellite a vu de la chaleur, pas là où le feu est maintenant, et wanderbar ne peut pas te dire dans quelle direction il va.",
  'wildfire.checkYourself': 'Consulte {link} et la protection civile locale.',
  'wildfire.head.none': "Aucun incendie détecté près de cet itinéraire",
  'wildfire.head.error': "Impossible de vérifier les incendies actifs",
  'wildfire.body.none':
    "Aucun satellite n'a détecté d'incendie à moins de 20 km de ton itinéraire ces dernières {hours} h. Les satellites ne passent que quelques fois par jour et les nuages cachent les feux : ce n'est pas une garantie que rien ne brûle.",
  'wildfire.body.error':
    "Ce n'est peut-être qu'une connexion interrompue. wanderbar ne sait pas si quelque chose brûle près de cet itinéraire, ce qui n'est pas la même chose que rien ne brûle.",

  /*
   * The EAWS danger scale, in its official French wording — not a translation
   * choice. Météo-France's BERA and SLF both publish exactly these five terms,
   * and note that level 2 is "Limité", never "Modéré": a reader comparing
   * wanderbar against the bulletin must find the same word.
   */
  'danger.1': 'Faible',
  'danger.2': 'Limité',
  'danger.3': 'Marqué',
  'danger.4': 'Fort',
  'danger.5': 'Très fort',

  'condition.rain': 'Pluie',
  'condition.hail': 'Grêle',
  'condition.wind': 'Vent',
  'condition.snow': 'Neige',
  'condition.heat': 'Chaleur',
  'condition.blizzard': 'Blizzard',
  'condition.thunderstorm': 'Orage',
  'condition.darkness': 'Obscurité',
  'condition.fire': "Risque d'incendie",
  'condition.ice': 'Pluie verglaçante',
  'condition.coldwind': 'Refroidissement éolien',
  'condition.deepsnow': 'Neige profonde',

  'source.open-meteo': 'Open-Meteo',
  'source.met': 'MET',
  'source.open-meteo+met': 'Open-Meteo + MET',
  'source.computed': 'calculé ici',

  'detail.rainRate': '{mm} mm/h',
  'detail.hailPossible': 'possible',
  'detail.gusts': 'rafales {kmh} km/h',
  'detail.snowfall': '{cm} cm',
  'detail.snowExpected': 'attendue',
  'detail.blizzard': 'rafales {kmh} km/h à {temp} °C',
  'detail.lyingSnow': '{cm} cm au sol',
  'detail.heat': '{temp} °C',
  'detail.fire': '{danger}, IFM {fwi}',
  'detail.windChill': 'ressenti {temp} °C',
  'detail.windChillFrostbite': 'ressenti {temp} °C, gelures {band}',
  'detail.sunrise': 'lever du soleil {time}',
  'detail.beforeSunrise': 'avant le lever du soleil {time}',
  'detail.afterSunset': 'après le coucher du soleil {time}',
  'detail.dusk': 'crépuscule, coucher du soleil {time}',

  'frostbite.under2': 'moins de 2 min',
  'frostbite.2to5': '2-5 min',
  'frostbite.5to10': '5-10 min',
  'frostbite.10to30': '10-30 min',

  'instability.expected': 'attendu',
  'instability.weak': 'courants ascendants faibles',
  'instability.strong': 'courants ascendants forts',
  'instability.violent': 'courants ascendants violents',
  'instability.extreme': 'courants ascendants extrêmes',

  'ice.56': 'bruine verglaçante',
  'ice.57': 'bruine verglaçante dense',
  'ice.66': 'pluie verglaçante',
  'ice.67': 'forte pluie verglaçante',

  /* EFFIS/Copernicus fire-danger classes, official French wording. */
  'fireDanger.very low': 'très faible',
  'fireDanger.low': 'faible',
  'fireDanger.moderate': 'modéré',
  'fireDanger.high': 'élevé',
  'fireDanger.very high': 'très élevé',
  'fireDanger.extreme': 'extrême',

  'profile.hiking': 'Randonnée',
  'profile.mountain': 'Randonnée en montagne',
  'profile.winter': 'Randonnée hivernale',
  'profile.running': 'Trail',
  'profile.cycling': 'Vélo',
  'profile.ski': 'Ski de randonnée',

  'rest.none': 'Aucune pause',
  'rest.short': 'Pauses courtes',
  'rest.normal': 'Pauses normales',
  'rest.leisurely': 'Longues pauses',
  'rest.movingTimeOnly': 'Les barèmes ne comptent que le temps de marche effectif.',

  'panel.newTrack': 'Nouvelle trace',
  'panel.thisTrack': 'Cette trace',
  'panel.warningSettings': 'Réglages des alertes',
  'panel.background': 'Vérifications en arrière-plan',
  'panel.questions': 'Questions',

  'upload.file': 'Trace GPX',
  'upload.name': 'Nom (facultatif)',
  'upload.start': 'Départ',
  'upload.profile': "Profil d'allure",
  'upload.breaks': 'Pauses',
  'upload.submit': 'Ajouter la trace',
  'upload.adding': 'Ajout…',
  'upload.chooseFirst': "Choisis d'abord un fichier .gpx.",
  'upload.unreadable': "Ce fichier n'a pas pu être lu.",
  'upload.unparseable': "Ce fichier n'a pas pu être lu comme du GPX.",
  'upload.sparse':
    "Ce fichier GPX ressemble à un itinéraire, pas à une trace enregistrée. Exporte une trace avec des points rapprochés (moins de 200 m).",

  'manage.name': 'Nom',
  'manage.nameThis': 'Nommer cette randonnée',
  'manage.save': 'Enregistrer',
  'manage.delete': 'Supprimer cette trace',
  'manage.confirmDelete': 'Supprimer « {name} » ?',

  'settings.fireDangerFrom': "Risque d'incendie à partir de",
  'settings.heatAbove': 'Chaleur au-dessus de (°C)',
  'settings.windChillBelow': 'Refroidissement éolien en dessous de (°C)',
  'settings.lyingSnowAbove': 'Neige au sol au-dessus de (m)',
  'settings.gustsAbove': 'Rafales au-dessus de (km/h)',
  'settings.rainAbove': 'Pluie au-dessus de (mm/h)',
  'settings.enableFirst': 'Active {condition} pour régler ceci',

  'schedule.enable': 'Vérifier en arrière-plan',
  'schedule.every': 'Toutes les',
  'schedule.from': 'De',
  'schedule.to': 'À',
  'schedule.hours': '{n} h',
  'schedule.invalidRange': "L'heure de début doit précéder l'heure de fin.",
  'schedule.enableButton': 'Activer les notifications',
  'schedule.enabling': 'Activation…',
  'schedule.nextCheck': 'Prochaine vérification {time}.',
  'schedule.saveFailed': "Ce programme n'a pas pu être enregistré.",
  'schedule.blocked': 'Les notifications sont bloquées pour ce site.',
  'schedule.off': 'Les vérifications en arrière-plan sont désactivées.',
  'schedule.unsupported': "Ce navigateur ne peut pas vérifier en arrière-plan.",

  'capability.onWhileOpen': 'Les alertes apparaissent tant que wanderbar est ouvert.',
  'capability.background':
    " Les vérifications en arrière-plan ont lieu toutes les {n} h entre {from} et {to}.",
  'capability.enableToBackground':
    " Active les notifications pour être alerté en arrière-plan.",

  'notify.worsened': 'Météo un-wanderbar à venir',
  'notify.clearing': "La météo s'améliore",
  'notify.atKm': 'km {km}',
  'notify.atPoint': 'point {seq}',
  'notify.more': '+{n} autres',
  'notify.lifted_one': '… et {n} alerte levée',
  'notify.lifted_other': '… et {n} alertes levées',

  'share.adding': 'Ajout de ta trace…',
  'share.back': 'Retour à wanderbar',
  'share.noFile': "Aucun fichier n'est arrivé avec ce partage.",
  'share.tooLarge': 'Ce fichier est trop volumineux (5 Mo maximum).',

  'error.notFound.title': 'Page introuvable',
  'error.notFound.body':
    "Cette adresse n'existe pas. wanderbar n'a qu'un seul écran : ta trace et la météo le long de celle-ci.",
  'error.broke.title': "Quelque chose s'est cassé",
  'error.broke.body':
    "C'est de notre faute, pas de la tienne. Ta trace et tes réglages sont stockés sur ton appareil et ne sont pas affectés, tu peux recharger sans risque.",
  'error.back': 'Retour à ta trace',

  'credits.weatherBy': 'Données météo par',
  'credits.crossCheck': "Contre-vérification de l'Institut météorologique norvégien / Yr",
  'credits.icons': 'Icônes météo ©',
  'credits.source': 'Code source sur GitHub'
}
